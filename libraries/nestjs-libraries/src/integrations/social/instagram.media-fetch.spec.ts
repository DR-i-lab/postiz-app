import { afterEach, describe, expect, it, vi } from 'vitest';

// outside a Temporal activity setHeartbeatDetails has no context to talk to
vi.mock('@gitroom/nestjs-libraries/temporal/temporal.heartbeat', () => ({
  setHeartbeatDetails: vi.fn(),
}));
vi.mock('@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher', () => ({
  getSsrfSafeDispatcher: () => undefined,
  getSsrfSafeAxios: () => vi.fn(),
}));

import { InstagramProvider } from '@gitroom/nestjs-libraries/integrations/social/instagram.provider';

// The post workflow publishes again only failures that carry the
// `mediaFetch` detail (see MediaFetchFailed in social.abstract.ts).
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err: any) {
    return {
      type: err.type,
      message: err.message,
      mediaFetch: err.details?.[0]?.mediaFetch === true,
    };
  }
  throw new Error('expected a failure');
};

const containerStatus = (status_code: string, status: string) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ status_code, status })))
  );

const pending = {
  type: 'graph.facebook.com',
  postType: 'single' as const,
  containers: ['c1'],
  message: '',
};

describe('Instagram: Meta could not download or upload the media', () => {
  const ig = new InstagramProvider();
  afterEach(() => vi.unstubAllGlobals());

  it.each(['2207052', '2207003', '2207076'])(
    'a container in ERROR with %s is retried by the workflow',
    async (code) => {
      containerStatus(
        'ERROR',
        `Error: Media upload has failed with error code ${code}`
      );
      const f = await failure(ig.checkPostStatus('t', pending, {} as any));
      expect(f).toMatchObject({ type: 'bad_body', mediaFetch: true });
    }
  );

  it('2207076 keeps a readable message', async () => {
    containerStatus('ERROR', 'Error: Media upload has failed with error code 2207076');
    const f = await failure(ig.checkPostStatus('t', pending, {} as any));
    expect(f.message).toBe('Instagram could not upload the reel, please try again');
  });

  it('a bare ERROR is retried', async () => {
    containerStatus('ERROR', 'ERROR');
    const f = await failure(ig.checkPostStatus('t', pending, {} as any));
    expect(f.mediaFetch).toBe(true);
  });

  it('other container errors are not retried', async () => {
    containerStatus('ERROR', 'Error: Media upload has failed with error code 2207026');
    const f = await failure(ig.checkPostStatus('t', pending, {} as any));
    expect(f).toMatchObject({ type: 'bad_body', mediaFetch: false });
  });

  it('a 2207076 answer to a request fails at once, without the 5 s retries', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: 9004, error_subcode: 2207076 } }),
          { status: 400 }
        )
    );
    vi.stubGlobal('fetch', fetchMock);
    const f = await failure(ig.fetch('https://graph.facebook.com/x', { method: 'POST' }));
    expect(f).toMatchObject({ type: 'bad_body', mediaFetch: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
