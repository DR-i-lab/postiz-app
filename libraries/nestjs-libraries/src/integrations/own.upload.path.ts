import { join, resolve } from 'path';

// Our own uploads are stored as full public URLs (FRONTEND_URL + /uploads/...),
// so a provider that reads its media from `path` would download from the
// server's own public address: out through the reverse proxy and back in. This
// maps such a URL to the file on the worker's disk instead.
//
// Pure string work, no disk access: the caller still has to check the result
// (inside UPLOAD_DIRECTORY, symlinks, existence). Returns null whenever the
// URL is not ours, and the caller then keeps the URL as it is.

const UPLOADS_PREFIX = '/uploads/';

const originOf = (value: string): string | null => {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.origin
      : null;
  } catch {
    return null;
  }
};

// Origins whose /uploads/ we serve: FRONTEND_URL plus UPLOAD_LOCAL_ORIGINS, a
// comma-separated list (older files were stored under a previous domain).
export const ownUploadOrigins = (
  env: NodeJS.ProcessEnv = process.env
): Set<string> => {
  const origins = new Set<string>();
  const listed = [env.FRONTEND_URL, ...(env.UPLOAD_LOCAL_ORIGINS || '').split(',')];
  for (const value of listed) {
    const origin = value ? originOf(value) : null;
    if (origin) {
      origins.add(origin);
    }
  }
  return origins;
};

export const ownUploadCandidatePath = (
  path: unknown,
  env: NodeJS.ProcessEnv = process.env
): string | null => {
  if (typeof path !== 'string' || !env.UPLOAD_DIRECTORY) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(path);
  } catch {
    return null;
  }

  // exact comparison of scheme + host + port, never a string prefix:
  // https://social.dr-i.tech.evil.com is a different origin
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    !ownUploadOrigins(env).has(url.origin)
  ) {
    return null;
  }

  // query string and fragment are not part of url.pathname
  if (!url.pathname.startsWith(UPLOADS_PREFIX)) {
    return null;
  }

  let relative: string;
  try {
    relative = decodeURIComponent(url.pathname.slice(UPLOADS_PREFIX.length));
  } catch {
    return null;
  }

  // %2e%2e and %2f only show up after decoding
  if (
    !relative ||
    relative.includes('\0') ||
    relative.includes('\\') ||
    relative.split('/').some((segment) => segment === '..')
  ) {
    return null;
  }

  return join(resolve(env.UPLOAD_DIRECTORY), relative);
};
