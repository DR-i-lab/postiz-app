import { afterEach, describe, expect, it, vi } from 'vitest';

// outside a Temporal activity setHeartbeatDetails has no context to talk to
vi.mock('@gitroom/nestjs-libraries/temporal/temporal.heartbeat', () => ({
  setHeartbeatDetails: vi.fn(),
}));
vi.mock('@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher', () => ({
  getSsrfSafeDispatcher: () => undefined,
  getSsrfSafeAxios: () => vi.fn(),
}));

import { YoutubeProvider } from '@gitroom/nestjs-libraries/integrations/social/youtube.provider';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';

// thumbnails.set applies a Short's custom thumbnail only after the video
// finished processing, so the thumbnail waits for processingDetails.

const base = {
  uploadUri: 'https://upload.example/session',
  videoSize: 1000,
  path: '/uploads/v.mp4',
  uploadedBytes: 1000,
  thumbnail: 'https://social.example/uploads/cover.jpg',
  postDbId: 'post1',
};

// answers the upload session probe and the videos.list status read
const youtube = (
  videos: { status: number; body?: any },
  probe: { status: number; body?: any } = { status: 200, body: { id: 'vid1' } }
) => {
  const fetchMock = vi.fn(async (url: string) => {
    const r = String(url).includes('/youtube/v3/videos?') ? videos : probe;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const listed = (processingStatus?: string, uploadStatus = 'uploaded') => ({
  status: 200,
  body: {
    items: [
      {
        id: 'vid1',
        status: { uploadStatus },
        ...(processingStatus ? { processingDetails: { processingStatus } } : {}),
      },
    ],
  },
});

describe('YouTube: the thumbnail waits for the video processing', () => {
  const yt = new YoutubeProvider();
  afterEach(() => vi.unstubAllGlobals());

  it('keeps waiting while the video is processing', async () => {
    youtube(listed('processing'));
    const r = await yt.checkPostStatus(
      't',
      { ...base, videoId: 'vid1' },
      {} as any
    );
    expect(r).toEqual({
      status: 'pending',
      pendingData: { ...base, videoId: 'vid1', processingChecks: 1 },
    });
  });

  it('hands the thumbnail to finalizePost once processing succeeded', async () => {
    youtube(listed('succeeded', 'processed'));
    const r = await yt.checkPostStatus(
      't',
      { ...base, videoId: 'vid1', processingChecks: 4 },
      {} as any
    );
    expect(r).toMatchObject({
      status: 'ready',
      pendingData: { videoId: 'vid1', processingChecks: 5 },
    });
  });

  it.each(['failed', 'terminated'])(
    'stops waiting when processing %s',
    async (s) => {
      youtube(listed(s));
      const r = await yt.checkPostStatus(
        't',
        { ...base, videoId: 'vid1' },
        {} as any
      );
      expect(r.status).toBe('ready');
    }
  );

  it('falls back to uploadStatus without processingDetails', async () => {
    youtube(listed(undefined, 'processed'));
    const r = await yt.checkPostStatus(
      't',
      { ...base, videoId: 'vid1' },
      {} as any
    );
    expect(r.status).toBe('ready');
  });

  it('waits when the video is not listed yet', async () => {
    youtube({ status: 200, body: { items: [] } });
    const r = await yt.checkPostStatus(
      't',
      { ...base, videoId: 'vid1' },
      {} as any
    );
    expect(r.status).toBe('pending');
  });

  it('waits when the status read fails', async () => {
    youtube({ status: 503 });
    const r = await yt.checkPostStatus(
      't',
      { ...base, videoId: 'vid1' },
      {} as any
    );
    expect(r.status).toBe('pending');
  });

  it('asks for a token refresh on 401', async () => {
    youtube({ status: 401, body: { error: 'Unauthorized' } });
    await expect(
      yt.checkPostStatus('t', { ...base, videoId: 'vid1' }, {} as any)
    ).rejects.toBeInstanceOf(RefreshToken);
  });

  it('sets the thumbnail anyway after the last check', async () => {
    const fetchMock = youtube(listed('processing'));
    const r = await yt.checkPostStatus(
      't',
      { ...base, videoId: 'vid1', processingChecks: 30 },
      {} as any
    );
    expect(r.status).toBe('ready');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a completed upload session also waits for processing', async () => {
    const fetchMock = youtube(listed('processing'));
    const r = await yt.checkPostStatus('t', base, {} as any);
    expect(r).toMatchObject({
      status: 'pending',
      pendingData: { videoId: 'vid1', processingChecks: 1 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('without a thumbnail a completed upload is done at once', async () => {
    youtube(listed('processing'));
    const r = await yt.checkPostStatus(
      't',
      { ...base, thumbnail: '' },
      {} as any
    );
    expect(r).toEqual({
      status: 'completed',
      postId: 'vid1',
      releaseURL: 'https://www.youtube.com/watch?v=vid1',
    });
  });

  it('finalizePost records the new video instead of setting the thumbnail', async () => {
    const fetchMock = youtube(listed('processing'));
    const r = await yt.finalizePost('t', base, {} as any);
    expect(r).toEqual({
      status: 'pending',
      pendingData: { ...base, videoId: 'vid1', uploadedBytes: 1000 },
    });
    // only the session probe: no thumbnail upload yet
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
