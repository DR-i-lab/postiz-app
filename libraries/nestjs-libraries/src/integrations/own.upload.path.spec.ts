import { describe, expect, it } from 'vitest';
import { resolve } from 'path';
import {
  ownUploadCandidatePath,
  ownUploadOrigins,
} from '@gitroom/nestjs-libraries/integrations/own.upload.path';

const dir = resolve('/srv/uploads');
const env = (extra: Record<string, string | undefined> = {}) =>
  ({
    FRONTEND_URL: 'https://social.dr-i.tech',
    UPLOAD_LOCAL_ORIGINS: 'https://postiz.dr-i.tech',
    UPLOAD_DIRECTORY: dir,
    ...extra,
  }) as NodeJS.ProcessEnv;

describe('ownUploadCandidatePath', () => {
  it('maps FRONTEND_URL and every UPLOAD_LOCAL_ORIGINS host to the disk', () => {
    expect(
      ownUploadCandidatePath('https://social.dr-i.tech/uploads/2026/11/a.mp4', env())
    ).toBe(`${dir}/2026/11/a.mp4`);
    expect(
      ownUploadCandidatePath('https://postiz.dr-i.tech/uploads/2026/10/b.mp4', env())
    ).toBe(`${dir}/2026/10/b.mp4`);
  });

  it('accepts a comma-separated list with spaces and bad entries', () => {
    const e = env({ UPLOAD_LOCAL_ORIGINS: ' https://a.example , nonsense,, https://b.example:8443/x ' });
    expect(ownUploadCandidatePath('https://a.example/uploads/f.mp4', e)).toBe(`${dir}/f.mp4`);
    expect(ownUploadCandidatePath('https://b.example:8443/uploads/f.mp4', e)).toBe(`${dir}/f.mp4`);
    expect(ownUploadCandidatePath('https://b.example/uploads/f.mp4', e)).toBeNull();
  });

  it('ignores a host that is not listed', () => {
    expect(ownUploadCandidatePath('https://example.com/uploads/a.mp4', env())).toBeNull();
    expect(ownUploadCandidatePath('https://cdn.dr-i.tech/uploads/a.mp4', env())).toBeNull();
  });

  it('compares the origin exactly, not as a string prefix', () => {
    for (const url of [
      'https://social.dr-i.tech.evil.com/uploads/a.mp4',
      'https://social.dr-i.tech@evil.com/uploads/a.mp4',
      'https://evil.com/https://social.dr-i.tech/uploads/a.mp4',
      'https://social.dr-i.tech:8443/uploads/a.mp4',
      'http://social.dr-i.tech/uploads/a.mp4',
      'ftp://social.dr-i.tech/uploads/a.mp4',
      'https://xsocial.dr-i.tech/uploads/a.mp4',
    ]) {
      expect(ownUploadCandidatePath(url, env()), url).toBeNull();
    }
  });

  it('is not fooled by letter case or the default port', () => {
    expect(
      ownUploadCandidatePath('HTTPS://Social.DR-I.tech:443/uploads/a.mp4', env())
    ).toBe(`${dir}/a.mp4`);
  });

  it('only maps /uploads/, ignoring query string and fragment', () => {
    expect(ownUploadCandidatePath('https://social.dr-i.tech/api/uploads/a.mp4', env())).toBeNull();
    expect(ownUploadCandidatePath('https://social.dr-i.tech/uploads', env())).toBeNull();
    expect(ownUploadCandidatePath('https://social.dr-i.tech/uploads/', env())).toBeNull();
    expect(ownUploadCandidatePath('https://social.dr-i.tech/x?next=/uploads/a.mp4', env())).toBeNull();
    expect(ownUploadCandidatePath('https://social.dr-i.tech/uploads/a.mp4?x=1&y=/b#frag', env())).toBe(
      `${dir}/a.mp4`
    );
  });

  it('decodes the path, so a stored space still finds its file', () => {
    expect(ownUploadCandidatePath('https://social.dr-i.tech/uploads/2026/a%20b.mp4', env())).toBe(
      `${dir}/2026/a b.mp4`
    );
  });

  it('never leaves the upload directory: plain, encoded and mixed traversal', () => {
    for (const url of [
      'https://social.dr-i.tech/uploads/../etc/passwd',
      'https://social.dr-i.tech/uploads/a/../../etc/passwd',
      'https://social.dr-i.tech/uploads/%2e%2e/etc/passwd',
      'https://social.dr-i.tech/uploads/%2E%2E/etc/passwd',
      'https://social.dr-i.tech/uploads/a/%2e%2e/%2e%2e/etc/passwd',
      'https://social.dr-i.tech/uploads/..%2fetc/passwd',
      'https://social.dr-i.tech/uploads/a%2f..%2f..%2fetc%2fpasswd',
      'https://social.dr-i.tech/uploads/a%2F..%2F..%2Fetc',
      'https://social.dr-i.tech/uploads/..%5cetc',
      'https://social.dr-i.tech/uploads/a%00.mp4',
      'https://social.dr-i.tech/uploads/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    ]) {
      const mapped = ownUploadCandidatePath(url, env());
      // either refused, or (the URL parser having collapsed the dots) not ours
      expect(mapped === null || mapped.startsWith(dir + '/'), url).toBe(true);
      expect(mapped?.includes('..') ?? false, url).toBe(false);
    }
    expect(ownUploadCandidatePath('https://social.dr-i.tech/uploads/a%2f..%2f..%2fetc', env())).toBeNull();
    expect(ownUploadCandidatePath('https://social.dr-i.tech/uploads/..%2fetc', env())).toBeNull();
  });

  it('a double slash does not turn the path into an absolute one', () => {
    expect(ownUploadCandidatePath('https://social.dr-i.tech/uploads//etc/passwd', env())).toBe(
      `${dir}/etc/passwd`
    );
  });

  it('does nothing without UPLOAD_DIRECTORY', () => {
    expect(
      ownUploadCandidatePath('https://social.dr-i.tech/uploads/a.mp4', env({ UPLOAD_DIRECTORY: undefined }))
    ).toBeNull();
    expect(
      ownUploadCandidatePath('https://social.dr-i.tech/uploads/a.mp4', env({ UPLOAD_DIRECTORY: '' }))
    ).toBeNull();
  });

  it('without UPLOAD_LOCAL_ORIGINS only FRONTEND_URL maps', () => {
    const e = env({ UPLOAD_LOCAL_ORIGINS: undefined });
    expect(ownUploadCandidatePath('https://social.dr-i.tech/uploads/a.mp4', e)).toBe(`${dir}/a.mp4`);
    expect(ownUploadCandidatePath('https://postiz.dr-i.tech/uploads/a.mp4', e)).toBeNull();
  });

  it('without FRONTEND_URL nothing maps unless listed', () => {
    const e = env({ FRONTEND_URL: undefined, UPLOAD_LOCAL_ORIGINS: undefined });
    expect(ownUploadOrigins(e).size).toBe(0);
    expect(ownUploadCandidatePath('https://social.dr-i.tech/uploads/a.mp4', e)).toBeNull();
  });

  it('leaves relative paths, junk and non-strings alone', () => {
    for (const value of ['/uploads/a.mp4', 'uploads/a.mp4', 'not a url', '', undefined, null, 42]) {
      expect(ownUploadCandidatePath(value as any, env())).toBeNull();
    }
  });
});
