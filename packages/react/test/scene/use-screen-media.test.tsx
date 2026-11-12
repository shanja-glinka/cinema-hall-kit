import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { CanvasTexture, Texture, VideoTexture } from 'three';
import type * as THREE from 'three';
import type { ScreenContent } from '@cinema-hall/core';
import { useScreenMedia } from '../../src/scene/use-screen-media.js';
import { fakeCanvas2D, useFakeContext } from './canvas-fake.js';

interface PendingLoad {
  url: string;
  onLoad: (texture: Texture) => void;
  onError: () => void;
}

const loads = vi.hoisted(() => ({ pending: [] as PendingLoad[] }));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof THREE>();
  class FakeTextureLoader {
    setCrossOrigin(): void {}
    load(
      url: string,
      onLoad: (texture: Texture) => void,
      _progress: unknown,
      onError: () => void,
    ): Texture {
      loads.pending.push({ url, onLoad, onError });
      return new actual.Texture();
    }
  }
  return { ...actual, TextureLoader: FakeTextureLoader };
});

const image = (src: string): ScreenContent => ({ kind: 'image', src });

/** The load the hook started for `url` most recently. */
function pendingFor(url: string): PendingLoad {
  const found = loads.pending.filter((load) => load.url === url).at(-1);
  if (!found) throw new Error(`no load for ${url}`);
  return found;
}

function imageTexture(size = { width: 1200, height: 500 }): Texture {
  const texture = new Texture();
  Object.assign(texture, { image: { ...size } });
  return texture;
}

afterEach(() => {
  cleanup();
  loads.pending.length = 0;
  vi.restoreAllMocks();
});

/** Records the video elements the hook creates. Playback does not run in jsdom, so play, pause and load are stubs. */
function watchVideo() {
  const videos: HTMLVideoElement[] = [];
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((
    tag: string,
    options?: ElementCreationOptions,
  ) => {
    const element = createElement(tag, options);
    if (tag === 'video') videos.push(element as HTMLVideoElement);
    return element;
  }) as typeof document.createElement);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  return { videos, pause };
}

describe('screen picture', () => {
  it('ignores a request that newer content has superseded', () => {
    const onSettled = vi.fn();
    const { rerender } = renderHook(
      ({ content }: { content: ScreenContent }) => useScreenMedia(content, 2.4, onSettled),
      { initialProps: { content: image('a.png') } },
    );
    rerender({ content: image('b.png') });

    act(() => pendingFor('a.png').onLoad(imageTexture()));
    expect(onSettled).not.toHaveBeenCalled();

    act(() => pendingFor('b.png').onLoad(imageTexture()));
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('settles once, with the picture on screen', () => {
    const onSettled = vi.fn();
    const { result } = renderHook(() => useScreenMedia(image('a.png'), 2.4, onSettled));
    act(() => pendingFor('a.png').onLoad(imageTexture()));
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(result.current.texture).toBeInstanceOf(Texture);
  });

  it('frees the picture on screen only when it is replaced', () => {
    const { result, rerender } = renderHook(
      ({ content }: { content: ScreenContent }) => useScreenMedia(content, 2.4, vi.fn()),
      { initialProps: { content: image('a.png') } },
    );
    act(() => pendingFor('a.png').onLoad(imageTexture()));
    const shown = result.current.texture;
    if (!shown) throw new Error('no picture on screen');
    const freed = vi.fn();
    shown.addEventListener('dispose', freed);

    rerender({ content: image('b.png') });
    expect(freed).not.toHaveBeenCalled();

    act(() => pendingFor('b.png').onLoad(imageTexture()));
    expect(freed).toHaveBeenCalledTimes(1);
  });

  it('frees a poster that arrives after playback started', () => {
    const created: HTMLVideoElement[] = [];
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((
      tag: string,
      options?: ElementCreationOptions,
    ) => {
      const element = createElement(tag, options);
      if (tag === 'video') created.push(element as HTMLVideoElement);
      return element;
    }) as typeof document.createElement);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);

    const { result } = renderHook(() =>
      useScreenMedia({ kind: 'video', src: 'v.mp4', poster: 'p.png' }, 2.4, vi.fn()),
    );
    const poster = pendingFor('p.png');
    const video = created[0];
    if (!video) throw new Error('no video element');
    act(() => video.dispatchEvent(new Event('loadeddata')));
    expect(result.current.texture).toBeInstanceOf(VideoTexture);

    const late = imageTexture();
    const freed = vi.fn();
    late.addEventListener('dispose', freed);
    act(() => poster.onLoad(late));
    expect(freed).toHaveBeenCalledTimes(1);
    expect(result.current.texture).toBeInstanceOf(VideoTexture);
  });

  it('draws an image without intrinsic size onto a canvas at the screen aspect', () => {
    const context = fakeCanvas2D();
    useFakeContext(context);
    const onSettled = vi.fn();
    const { result } = renderHook(() => useScreenMedia(image('dunes.svg'), 2.4, onSettled));
    const svg = imageTexture({ width: 0, height: 0 });
    const freed = vi.fn();
    svg.addEventListener('dispose', freed);

    act(() => pendingFor('dunes.svg').onLoad(svg));

    expect(freed).toHaveBeenCalledTimes(1);
    expect(context.drawImage).toHaveBeenCalledWith(svg.image, 0, 0, 2048, 853);
    expect(result.current.texture).toBeInstanceOf(CanvasTexture);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('shows the solid colour when a zero-size image cannot be drawn', () => {
    const context = fakeCanvas2D();
    context.drawImage.mockImplementation(() => {
      throw new Error('InvalidStateError');
    });
    useFakeContext(context);
    const onSettled = vi.fn();
    const { result } = renderHook(() => useScreenMedia(image('broken.svg'), 2.4, onSettled));
    act(() => pendingFor('broken.svg').onLoad(imageTexture({ width: 0, height: 0 })));
    expect(result.current.texture).toBeNull();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('shows the solid colour, and settles, without content', () => {
    const onSettled = vi.fn();
    const { result } = renderHook(() => useScreenMedia(undefined, 2.4, onSettled));
    expect(result.current.texture).toBeNull();
    expect(result.current.ready).toBe(true);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('shows the solid colour, and settles, when the image fails to load', () => {
    const onSettled = vi.fn();
    const { result } = renderHook(() => useScreenMedia(image('missing.png'), 2.4, onSettled));
    act(() => pendingFor('missing.png').onError());
    expect(result.current.texture).toBeNull();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});

describe('screen picture when the video breaks', () => {
  it('shows the poster again when the video breaks while it plays', () => {
    const { videos, pause } = watchVideo();
    const { result } = renderHook(() =>
      useScreenMedia({ kind: 'video', src: 'v.mp4', poster: 'p.png' }, 2.4, vi.fn()),
    );
    const video = videos[0];
    if (!video) throw new Error('no video element');
    act(() => video.dispatchEvent(new Event('loadeddata')));
    expect(result.current.texture).toBeInstanceOf(VideoTexture);

    act(() => video.dispatchEvent(new Event('error')));
    expect(pause).toHaveBeenCalled();
    const reloaded = imageTexture();
    act(() => pendingFor('p.png').onLoad(reloaded));
    expect(result.current.texture).toBe(reloaded);
  });

  it('shows the solid colour when the video breaks while it plays, without a poster', () => {
    const { videos } = watchVideo();
    const { result } = renderHook(() =>
      useScreenMedia({ kind: 'video', src: 'v.mp4' }, 2.4, vi.fn()),
    );
    const video = videos[0];
    if (!video) throw new Error('no video element');
    act(() => video.dispatchEvent(new Event('loadeddata')));
    act(() => video.dispatchEvent(new Event('error')));
    expect(result.current.texture).toBeNull();
  });

  it('shows the solid colour when the poster cannot be loaded after the video breaks', () => {
    const { videos } = watchVideo();
    const { result } = renderHook(() =>
      useScreenMedia({ kind: 'video', src: 'v.mp4', poster: 'p.png' }, 2.4, vi.fn()),
    );
    const video = videos[0];
    if (!video) throw new Error('no video element');
    act(() => video.dispatchEvent(new Event('loadeddata')));
    act(() => video.dispatchEvent(new Event('error')));
    act(() => pendingFor('p.png').onError());
    expect(result.current.texture).toBeNull();
  });

  it('keeps a poster on screen when the video breaks before it plays', () => {
    const { videos } = watchVideo();
    const { result } = renderHook(() =>
      useScreenMedia({ kind: 'video', src: 'v.mp4', poster: 'p.png' }, 2.4, vi.fn()),
    );
    const video = videos[0];
    if (!video) throw new Error('no video element');
    const poster = imageTexture();
    act(() => pendingFor('p.png').onLoad(poster));
    act(() => video.dispatchEvent(new Event('error')));
    expect(result.current.texture).toBe(poster);
  });
});

describe('screen picture ownership', () => {
  it('frees a poster that the video supersedes before React shows it', () => {
    const { videos } = watchVideo();
    const { result } = renderHook(() =>
      useScreenMedia({ kind: 'video', src: 'v.mp4', poster: 'p.png' }, 2.4, vi.fn()),
    );
    const video = videos[0];
    if (!video) throw new Error('no video element');
    const poster = imageTexture();
    const freed = vi.fn();
    poster.addEventListener('dispose', freed);

    act(() => {
      pendingFor('p.png').onLoad(poster);
      video.dispatchEvent(new Event('loadeddata'));
    });
    expect(freed).toHaveBeenCalledTimes(1);
    expect(result.current.texture).toBeInstanceOf(VideoTexture);
  });

  it('frees a poster that is still queued when the hook unmounts', () => {
    watchVideo();
    const { unmount } = renderHook(() =>
      useScreenMedia({ kind: 'video', src: 'v.mp4', poster: 'p.png' }, 2.4, vi.fn()),
    );
    const poster = imageTexture();
    const freed = vi.fn();
    poster.addEventListener('dispose', freed);

    act(() => {
      pendingFor('p.png').onLoad(poster);
      unmount();
    });
    expect(freed).toHaveBeenCalledTimes(1);
  });
});
