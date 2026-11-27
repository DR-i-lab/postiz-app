import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// outside a Temporal activity setHeartbeatDetails has no context to talk to
vi.mock('@gitroom/nestjs-libraries/temporal/temporal.heartbeat', () => ({
  setHeartbeatDetails: vi.fn(),
}));

import { TiktokProvider } from '@gitroom/nestjs-libraries/integrations/social/tiktok.provider';

const box = (type: string, ...content: Buffer[]) => {
  const body = Buffer.concat(content);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length + 8, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, body]);
};

// a movie header of version 0, timescale 1000
const mvhd = (seconds: number) => {
  const body = Buffer.alloc(100);
  body.writeUInt32BE(1000, 12);
  body.writeUInt32BE(seconds * 1000, 16);
  return box('mvhd', body);
};

// moov after the media data, as phones write it
const mp4 = (seconds: number) =>
  Buffer.concat([
    box('ftyp', Buffer.from('isom')),
    box('mdat', Buffer.alloc(4096)),
    box('moov', mvhd(seconds), box('trak', Buffer.alloc(16))),
  ]);

const creator = (code: string, data: Record<string, unknown> = {}) =>
  vi.fn(async () => ({ json: async () => ({ data, error: { code } }) }));

describe('TikTok creator limits', () => {
  const provider = new TiktokProvider();
  const saved = { ...process.env };
  const integration = { token: 'token' } as any;
  const direct = { content_posting_method: 'DIRECT_POST' } as any;
  let uploads: string;

  const check = (path: string, settings = direct) =>
    provider.checkValidity([[{ path }]], settings, [], integration);

  beforeEach(() => {
    uploads = realpathSync(mkdtempSync(join(tmpdir(), 'tiktok-limits-')));
    process.env.UPLOAD_DIRECTORY = uploads;
    process.env.FRONTEND_URL = 'https://social.dr-i.tech';
  });

  afterEach(() => {
    process.env = { ...saved };
    vi.unstubAllGlobals();
    rmSync(uploads, { recursive: true, force: true });
  });

  it.each([
    'spam_risk_too_many_posts',
    'spam_risk_user_banned_from_posting',
    'reached_active_user_cap',
  ])('stops the post on %s', async (code) => {
    vi.stubGlobal('fetch', creator(code));

    expect((await provider.creatorInfo('token')).canPost).toBe(false);
    expect(await check('https://social.dr-i.tech/uploads/a.mp4')).toContain(
      "You can't post to this TikTok account right now"
    );
  });

  it('stops a video longer than the creator can post', async () => {
    vi.stubGlobal('fetch', creator('ok', { max_video_post_duration_sec: 60 }));
    writeFileSync(join(uploads, 'long.mp4'), mp4(90));

    expect(await check('https://social.dr-i.tech/uploads/long.mp4')).toContain(
      'The video is 90 seconds long'
    );
  });

  it('lets a video within the limit through', async () => {
    vi.stubGlobal('fetch', creator('ok', { max_video_post_duration_sec: 60 }));
    writeFileSync(join(uploads, 'short.mp4'), mp4(60));

    expect(await check('https://social.dr-i.tech/uploads/short.mp4')).toBe(
      true
    );
  });

  it('does not block when TikTok or the file cannot be read', async () => {
    vi.stubGlobal('fetch', creator('ok', { max_video_post_duration_sec: 60 }));
    writeFileSync(join(uploads, 'broken.mp4'), Buffer.from('not a video'));
    expect(await check('https://social.dr-i.tech/uploads/broken.mp4')).toBe(
      true
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      })
    );
    expect(await check('https://social.dr-i.tech/uploads/broken.mp4')).toBe(
      true
    );
  });

  it('does not ask TikTok when the media only goes to the inbox', async () => {
    const fetchSpy = creator('spam_risk_too_many_posts');
    vi.stubGlobal('fetch', fetchSpy);

    expect(
      await check('video.mp4', { content_posting_method: 'UPLOAD' } as any)
    ).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
