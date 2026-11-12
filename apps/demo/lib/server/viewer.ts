/**
 * The viewer id is an httpOnly cookie, created by the first occupancy request or the first
 * Server Action. It is the only identity the mock backend knows: `mine` holds are matched on it.
 */
export const VIEWER_COOKIE = 'chk_viewer';

export const VIEWER_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isViewerId(value: string | undefined): value is string {
  return value !== undefined && UUID.test(value);
}

export function newViewerId(): string {
  return crypto.randomUUID();
}
