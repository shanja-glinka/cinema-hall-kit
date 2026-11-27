/** The way back from a booking page: no browser, no server. */
import { expect, test } from '@playwright/test';
import { BACK_KEY, backTarget, readOrigin, rememberOrigin } from '../lib/shared/back-link';
import { sessionStore, type SessionStore } from '../lib/shared/browser-storage';

const memoryStorage = (): SessionStore => {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
};

test.describe('the way back from a booking page', () => {
  test('goes where the showtime was opened from, or to the hall showtimes', () => {
    expect(backTarget(null, 'grand hall')).toEqual({
      href: '/halls/grand%20hall/showtimes',
      kind: 'showtimes',
    });
    expect(backTarget('/', 'h')).toEqual({ href: '/', kind: 'home' });
    expect(backTarget('/?new=h#hall-h', 'h')).toEqual({ href: '/?new=h#hall-h', kind: 'home' });
    expect(backTarget('/halls/h/showtimes', 'h').kind).toBe('showtimes');
    expect(backTarget('/constructor?hall=h', 'h')).toEqual({
      href: '/constructor?hall=h',
      kind: 'editor',
    });
    expect(backTarget('/halls/new', 'h').kind).toBe('other');
    // Never another site, never a booking page.
    expect(backTarget('//evil.example/', 'h').kind).toBe('showtimes');
    expect(backTarget('https://evil.example/', 'h').kind).toBe('showtimes');
    expect(backTarget('/sessions/abc', 'h').href).toBe('/halls/h/showtimes');
  });

  test('a link to a showtime records the page it is on; links between showtimes do not', () => {
    const store = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string) => void store.set(key, value),
      getItem: (key: string) => store.get(key) ?? null,
    };
    rememberOrigin('/halls/new', '/', storage);
    expect(readOrigin(storage, { sessionId: 'a', hallId: 'h' })).toBeNull();
    rememberOrigin('/sessions/a', '/halls/h/showtimes', storage);
    expect(JSON.parse(store.get(BACK_KEY) ?? 'null')).toEqual({
      from: '/halls/h/showtimes',
      sessionId: 'a',
    });
    rememberOrigin('/sessions/b', '/sessions/a', storage);
    expect(readOrigin(storage, { sessionId: 'a', hallId: 'h' })).toBe('/halls/h/showtimes');
    const blocked = {
      setItem: () => {
        throw new Error('blocked');
      },
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => rememberOrigin('/sessions/a', '/', blocked)).not.toThrow();
    expect(readOrigin(blocked, { sessionId: 'a', hallId: 'h' })).toBeNull();
  });
});

test.describe('the way back belongs to the booking it was recorded for', () => {
  const memory = () => {
    const store = new Map<string, string>();
    return {
      setItem: (key: string, value: string) => void store.set(key, value),
      getItem: (key: string) => store.get(key) ?? null,
    };
  };

  test('a booking page of another hall, opened directly, falls back to its own showtimes', () => {
    const storage = memory();
    rememberOrigin('/sessions/a1', '/constructor?hall=a', storage);
    expect(readOrigin(storage, { sessionId: 'b1', hallId: 'b' })).toBeNull();
    // The booking it was recorded for still has it.
    expect(readOrigin(storage, { sessionId: 'a1', hallId: 'a' })).toBe('/constructor?hall=a');
  });

  test('the other showtimes of the same hall keep the way back', () => {
    const storage = memory();
    rememberOrigin('/sessions/a1?seat=x', '/halls/a/showtimes', storage);
    expect(readOrigin(storage, { sessionId: 'a1', hallId: 'a' })).toBe('/halls/a/showtimes');
    // A link on the booking page to another showtime of the hall records nothing new.
    rememberOrigin('/sessions/a2', '/sessions/a1', storage);
    expect(readOrigin(storage, { sessionId: 'a2', hallId: 'a' })).toBe('/halls/a/showtimes');
    expect(readOrigin(storage, { sessionId: 'a1', hallId: 'a' })).toBe('/halls/a/showtimes');
    expect(readOrigin(storage, { sessionId: 'b1', hallId: 'b' })).toBeNull();
  });

  test('a value stored by an older version of the page is ignored', () => {
    const storage = memory();
    storage.setItem('cinema-hall-demo:booking-origin', '/constructor?hall=a');
    expect(readOrigin(storage, { sessionId: 'a1', hallId: 'a' })).toBeNull();
  });
});

test.describe('blocked session storage', () => {
  test('a browser that throws on sessionStorage gets no storage and the default way back', () => {
    const blocked = {
      get sessionStorage(): SessionStore {
        throw new Error('SecurityError');
      },
    };
    expect(sessionStore(blocked)).toBeUndefined();
    expect(readOrigin(sessionStore(blocked), { sessionId: 's1', hallId: 'h1' })).toBeNull();
    const storage = memoryStorage();
    expect(sessionStore({ sessionStorage: storage })).toBe(storage);
    expect(sessionStore({})).toBeUndefined();
  });
});
