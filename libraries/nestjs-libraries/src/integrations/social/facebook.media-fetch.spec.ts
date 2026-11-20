import { afterEach, describe, expect, it, vi } from 'vitest';

// outside a Temporal activity setHeartbeatDetails has no context to talk to
vi.mock('@gitroom/nestjs-libraries/temporal/temporal.heartbeat', () => ({
  setHeartbeatDetails: vi.fn(),
}));
vi.mock('@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher', () => ({
  getSsrfSafeDispatcher: () => undefined,
  getSsrfSafeAxios: () => vi.fn(),
}));

import { FacebookProvider } from '@gitroom/nestjs-libraries/integrations/social/facebook.provider';

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

// Body returned by Graph on 2026-11-20 for one photo of a carousel.
const graphError = (isTransient: boolean) =>
  JSON.stringify({
    error: {
      message: 'Missing or invalid image file',
      type: 'OAuthException',
      code: 324,
      error_subcode: 2069019,
      is_transient: isTransient,
      error_user_title: 'Immagine obbligatoria',
      fbtrace_id: 'x',
    },
  });

const media = (n: number) => ({
  path: `https://social.dr-i.tech/uploads/2026/11/18/${n}.png`,
});

const carousel = {
  id: 'p1',
  message: 'testo',
  settings: { __type: 'facebook', post_type: 'post', url: '', title: '' },
  media: [media(1), media(2), media(3)],
} as any;

// Every /photos call succeeds except the one for `failing`, /feed records
// whether it was reached.
const graph = (failing: string, isTransient: boolean) => {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: any) => {
      calls.push(url);
      if (url.includes('/photos')) {
        const { url: photo } = JSON.parse(init.body);
        if (photo.endsWith(failing)) {
          return new Response(graphError(isTransient), { status: 400 });
        }
        return new Response(JSON.stringify({ id: `ph-${photo}` }));
      }
      return new Response(
        JSON.stringify({ id: 'page_post', permalink_url: 'https://fb/p' })
      );
    })
  );
  return calls;
};

describe('Facebook: Meta could not read one photo of a carousel', () => {
  const fb = new FacebookProvider();
  afterEach(() => vi.unstubAllGlobals());

  it('a transient 2069019 is retried by the workflow and never reaches /feed', async () => {
    const calls = graph('3.png', true);
    const f = await failure(
      (fb as any).postNonStory('page', 'token', [carousel])
    );
    expect(f).toMatchObject({
      type: 'bad_body',
      mediaFetch: true,
      message: 'Facebook could not read one of the images, please try again',
    });
    expect(calls.some((u) => u.includes('/feed'))).toBe(false);
  });

  it('fails at once, without the in-activity 5 s retries', async () => {
    const calls = graph('3.png', true);
    await failure((fb as any).postNonStory('page', 'token', [carousel]));
    expect(calls.filter((u) => u.includes('/photos'))).toHaveLength(3);
  });

  it('a 2069019 not flagged as transient stays a terminal "Invalid file"', async () => {
    graph('3.png', false);
    const f = await failure(
      (fb as any).postNonStory('page', 'token', [carousel])
    );
    expect(f).toMatchObject({
      type: 'bad_body',
      mediaFetch: false,
      message: 'Invalid file',
    });
  });

  it('the video download error 1363057 is still retried', () => {
    expect(
      fb.isMediaFetchError(
        '{"error":{"code":389,"error_subcode":1363057,"message":"Unable to fetch video file from URL"}}'
      )
    ).toBe(true);
  });
});
