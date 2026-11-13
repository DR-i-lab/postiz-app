import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

// outside a Temporal activity setHeartbeatDetails has no context to talk to
vi.mock('@gitroom/nestjs-libraries/temporal/temporal.heartbeat', () => ({
  setHeartbeatDetails: vi.fn(),
}));

const httpGet = vi.fn();
vi.mock('@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher', () => ({
  getSsrfSafeDispatcher: () => undefined,
  getSsrfSafeAxios: () => httpGet,
}));

import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { YoutubeProvider } from '@gitroom/nestjs-libraries/integrations/social/youtube.provider';
import { TiktokProvider } from '@gitroom/nestjs-libraries/integrations/social/tiktok.provider';

class Probe extends SocialAbstract {
  identifier = 'probe';
  map(path: string) {
    return this.ownUploadToLocalPath(path);
  }
  size(path: string) {
    return this.mediaSize(path, 'probe');
  }
  chunk(path: string, start: number, end: number) {
    return this.mediaChunk(path, start, end, 'probe');
  }
  stream(path: string) {
    return this.mediaStream(path, 'probe');
  }
  read(path: string) {
    return this.readOrFetch(path);
  }
}

const readAll = async (stream: any) => {
  const parts: Buffer[] = [];
  for await (const part of stream) {
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
};

const OLD = 'https://postiz.dr-i.tech/uploads/2026/10/27/video.mp4';
const NEW = 'https://social.dr-i.tech/uploads/2026/11/13/video.mp4';

describe('own uploads are read from disk', () => {
  let root: string;
  let uploads: string;
  let outside: string;
  let video: Buffer;
  const saved = { ...process.env };
  const fetchSpy = vi.fn();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'own-uploads-')));
    uploads = join(root, 'uploads');
    outside = join(root, 'outside');
    mkdirSync(join(uploads, '2026/10/27'), { recursive: true });
    mkdirSync(join(uploads, '2026/11/13'), { recursive: true });
    mkdirSync(outside);
    video = randomBytes(300_000);
    writeFileSync(join(uploads, '2026/10/27/video.mp4'), video);
    writeFileSync(join(uploads, '2026/11/13/video.mp4'), video);
    writeFileSync(join(outside, 'secret.txt'), 'secret');

    process.env.UPLOAD_DIRECTORY = uploads;
    process.env.FRONTEND_URL = 'https://social.dr-i.tech';
    process.env.UPLOAD_LOCAL_ORIGINS = 'https://postiz.dr-i.tech';
    fetchSpy.mockReset();
    httpGet.mockReset();
    warn.mockClear();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...saved };
    rmSync(root, { recursive: true, force: true });
  });

  it('maps both hosts to the file on disk, with no HTTP request', async () => {
    const probe = new Probe();
    expect(probe.map(OLD)).toBe(join(uploads, '2026/10/27/video.mp4'));
    expect(probe.map(NEW)).toBe(join(uploads, '2026/11/13/video.mp4'));
    expect(await probe.size(OLD)).toBe(video.length);
    expect(await probe.size(NEW)).toBe(video.length);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('serves Range reads (mediaChunk, mediaStream, readOrFetch) with identical bytes', async () => {
    const probe = new Probe();
    for (const url of [OLD, NEW]) {
      expect(await probe.chunk(url, 0, 99_999)).toEqual(video.subarray(0, 100_000));
      expect(await probe.chunk(url, 250_000, 299_999)).toEqual(video.subarray(250_000));
      expect(await readAll(await probe.stream(url))).toEqual(video);
      expect(await probe.read(url)).toEqual(video);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('TikTok and YouTube read their chunks and size from disk, byte for byte', async () => {
    const tiktok = new TiktokProvider() as any;
    const youtube = new YoutubeProvider() as any;
    expect(await youtube.youtubeMediaSize(OLD)).toBe(video.length);
    for (const [start, end] of [
      [0, 8 * 1024 - 1],
      [100_000, 199_999],
      [299_000, 299_999],
    ]) {
      const expected = video.subarray(start, end + 1);
      expect(await readAll(await tiktok.tiktokChunkStream(OLD, start, end))).toEqual(expected);
      expect(await readAll(await tiktok.tiktokChunkStream(NEW, start, end))).toEqual(expected);
      expect(await readAll(await youtube.youtubeChunkStream(OLD, start, end))).toEqual(expected);
      expect(await readAll(await youtube.youtubeChunkStream(NEW, start, end))).toEqual(expected);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps downloading a host that is not listed', async () => {
    fetchSpy.mockResolvedValue({ ok: true, headers: new Headers({ 'content-length': '10' }) });
    const url = 'https://cdn.example.com/uploads/2026/10/27/video.mp4';
    const probe = new Probe();
    expect(probe.map(url)).toBe(url);
    expect(await probe.size(url)).toBe(10);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps downloading a look-alike origin', async () => {
    const probe = new Probe();
    for (const url of [
      'https://social.dr-i.tech.evil.com/uploads/2026/11/13/video.mp4',
      'https://social.dr-i.tech@evil.com/uploads/2026/11/13/video.mp4',
    ]) {
      expect(probe.map(url)).toBe(url);
    }
  });

  it('refuses traversal, plain or encoded, and falls back to the URL', () => {
    const probe = new Probe();
    for (const url of [
      'https://social.dr-i.tech/uploads/../outside/secret.txt',
      'https://social.dr-i.tech/uploads/%2e%2e/outside/secret.txt',
      'https://social.dr-i.tech/uploads/..%2foutside%2fsecret.txt',
      'https://social.dr-i.tech/uploads/2026%2f..%2f..%2foutside%2fsecret.txt',
    ]) {
      expect(probe.map(url), url).toBe(url);
    }
  });

  it('refuses a symlink that leads out of the upload directory', () => {
    symlinkSync(join(outside, 'secret.txt'), join(uploads, 'link.txt'));
    symlinkSync(outside, join(uploads, 'dir-link'));
    const probe = new Probe();
    for (const url of [
      'https://social.dr-i.tech/uploads/link.txt',
      'https://social.dr-i.tech/uploads/dir-link/secret.txt',
    ]) {
      expect(probe.map(url), url).toBe(url);
    }
    expect(warn).toHaveBeenCalled();
  });

  it('follows a symlink that stays inside the upload directory', () => {
    symlinkSync(join(uploads, '2026/10/27/video.mp4'), join(uploads, 'alias.mp4'));
    expect(new Probe().map('https://social.dr-i.tech/uploads/alias.mp4')).toBe(
      join(uploads, 'alias.mp4')
    );
  });

  it('works when UPLOAD_DIRECTORY is itself a symlink', () => {
    const alias = join(root, 'uploads-alias');
    symlinkSync(uploads, alias);
    process.env.UPLOAD_DIRECTORY = alias;
    expect(new Probe().map(NEW)).toBe(join(alias, '2026/11/13/video.mp4'));
  });

  it('a missing file falls back to HTTP and says so', async () => {
    fetchSpy.mockResolvedValue({ ok: true, headers: new Headers({ 'content-length': '77' }) });
    const url = 'https://social.dr-i.tech/uploads/2026/11/13/missing.mp4';
    const probe = new Probe();
    expect(probe.map(url)).toBe(url);
    expect(await probe.size(url)).toBe(77);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('downloading it');
  });

  it('a directory is not a file: falls back to HTTP', () => {
    const url = 'https://social.dr-i.tech/uploads/2026/11';
    expect(new Probe().map(url)).toBe(url);
  });

  it('without UPLOAD_DIRECTORY nothing changes', async () => {
    delete process.env.UPLOAD_DIRECTORY;
    fetchSpy.mockResolvedValue({ ok: true, headers: new Headers({ 'content-length': '5' }) });
    const probe = new Probe();
    expect(probe.map(NEW)).toBe(NEW);
    expect(await probe.size(NEW)).toBe(5);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('without UPLOAD_LOCAL_ORIGINS the old host is still downloaded', () => {
    delete process.env.UPLOAD_LOCAL_ORIGINS;
    const probe = new Probe();
    expect(probe.map(OLD)).toBe(OLD);
    expect(probe.map(NEW)).toBe(join(uploads, '2026/11/13/video.mp4'));
  });

  it('a path that is already local, and a remote one, behave as before', async () => {
    const local = join(uploads, '2026/11/13/video.mp4');
    const probe = new Probe();
    expect(probe.map(local)).toBe(local);
    expect(await probe.size(local)).toBe(video.length);
    expect(probe.map('https://example.com/a.mp4')).toBe('https://example.com/a.mp4');
  });

  it('query string and fragment are ignored when mapping', () => {
    expect(new Probe().map(`${NEW}?cache=1#t=3`)).toBe(join(uploads, '2026/11/13/video.mp4'));
  });
});
