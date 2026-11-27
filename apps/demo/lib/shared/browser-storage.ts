/**
 * The browser's sessionStorage, read so that a browser that blocks it (privacy settings, a sandboxed
 * frame) gets `undefined` instead of an exception: reading `window.sessionStorage` itself can throw.
 */

/** The part of `Storage` the demo uses. */
export type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * sessionStorage, or `undefined` where it is blocked or there is no browser.
 * @param scope Where to read it from; `globalThis` (the window) by default.
 */
export function sessionStore(
  scope: { readonly sessionStorage?: SessionStore } = globalThis,
): SessionStore | undefined {
  try {
    return scope.sessionStorage ?? undefined;
  } catch {
    return undefined;
  }
}
