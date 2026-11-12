import { useEffect, useRef, useState } from 'react';
import { SRGBColorSpace, TextureLoader, VideoTexture, type Texture } from 'three';
import type { ScreenContent } from '@cinema-hall/core';
import { canvasTexture, fitTexture, rasteriseImage } from './textures.js';

/**
 * What the screen shows right now: the picture (or `null` for the solid colour), the playing video
 * element, and whether the first outcome has been settled.
 */
export interface ScreenMedia {
  /** The picture on the screen; null shows the solid fallback colour. */
  texture: Texture | null;
  /** The playing video, so the frame loop can keep rendering while it plays. */
  video: HTMLVideoElement | null;
  /** Set once the first outcome (a picture, or the solid fallback) is in the committed state. */
  ready: boolean;
}

interface MediaSize {
  width?: number;
  height?: number;
}

function imageSize(texture: Texture): { width: number; height: number } {
  const image = texture.image as MediaSize | undefined;
  return { width: image?.width ?? 0, height: image?.height ?? 0 };
}

/**
 * The screen content: an image (CORS), a muted looping video (VideoTexture, played after it loads),
 * or nothing.
 * Without content, or when loading fails, the screen shows its solid fallback colour (`texture`
 * null). A video that
 * breaks later shows its poster again, loaded once more, or the solid colour when no poster loads.
 *
 * `onSettled` runs once, after the first outcome is committed to the screen, so the frame that
 * follows shows it.
 * Each content value has its own effect run: a request that newer content has superseded neither
 * shows a picture
 * nor settles. A picture on screen is freed when it is replaced or the hook unmounts, never
 * earlier. A picture that
 * is superseded before React shows it is freed at that point, or when its content ends.
 */
export function useScreenMedia(
  content: ScreenContent | undefined,
  aspect: number,
  onSettled: () => void,
): ScreenMedia {
  const [media, setMedia] = useState<ScreenMedia>({ texture: null, video: null, ready: false });
  const settledRef = useRef(onSettled);
  const settled = useRef(false);
  // The picture the last committed render shows.
  const onScreen = useRef<Texture | null>(null);
  useEffect(() => {
    settledRef.current = onSettled;
  }, [onSettled]);

  const kind = content?.kind;
  const src = content?.src;
  const poster = content?.poster;

  // The picture on screen leaves the scene when it is replaced (or on unmount): free it at that point.
  useEffect(() => {
    const texture = media.texture;
    onScreen.current = texture;
    return () => texture?.dispose();
  }, [media.texture]);

  // Settles once the first outcome is in the committed state, not when a loader calls back.
  useEffect(() => {
    if (!media.ready || settled.current) return;
    settled.current = true;
    settledRef.current();
  }, [media.ready]);

  useEffect(() => {
    let alive = true;
    let element: HTMLVideoElement | null = null;
    let shown = false;
    let playing = false;
    // The picture handed to React last, while it may not be on screen yet. React can drop a state that a later
    // one supersedes before it renders, so this run frees such a picture itself: when it is superseded, or when
    // the run ends.
    let handed: Texture | null = null;
    const commit = (next: ScreenMedia) => {
      shown = true;
      if (handed && handed !== next.texture && handed !== onScreen.current) handed.dispose();
      handed = next.texture;
      setMedia(next);
    };
    const show = (texture: Texture, video: HTMLVideoElement | null) => {
      if (!alive) {
        texture.dispose();
        return;
      }
      commit({ texture, video, ready: true });
    };
    const showSolid = () => {
      if (alive) commit({ texture: null, video: null, ready: true });
    };
    const cleanup = () => {
      alive = false;
      if (handed && handed !== onScreen.current) handed.dispose();
      handed = null;
      if (element) {
        element.pause();
        element.removeAttribute('src');
        element.load();
      }
    };

    // A loaded image as a picture: as it is when it has a size, else drawn at the screen's aspect. Null when
    // the request was superseded or the image cannot be drawn. The loaded texture is freed here.
    const mappable = (texture: Texture): Texture | null => {
      const size = imageSize(texture);
      if (size.width > 0 && size.height > 0) {
        fitTexture(texture, size.width, size.height, aspect);
        return texture;
      }
      const raster = alive ? rasteriseImage(texture.image as CanvasImageSource, aspect) : null;
      texture.dispose();
      return raster ? canvasTexture(raster) : null;
    };

    if (!kind || !src) {
      showSolid();
      return cleanup;
    }

    const loader = new TextureLoader();
    loader.setCrossOrigin('anonymous');
    const loadImage = (url: string, onOk: (texture: Texture) => void, onFail: () => void) =>
      loader.load(
        url,
        (texture) => {
          texture.colorSpace = SRGBColorSpace;
          onOk(texture);
        },
        undefined,
        () => onFail(),
      );

    if (kind === 'image') {
      loadImage(
        src,
        (texture) => {
          const picture = mappable(texture);
          if (picture) show(picture, null);
          else showSolid();
        },
        showSolid,
      );
      return cleanup;
    }

    const video = document.createElement('video');
    element = video;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    if (poster) {
      loadImage(
        poster,
        (texture) => {
          const picture = mappable(texture);
          if (!picture) return;
          // The poster is only the first frame: one that arrives after playback started is not needed.
          if (playing || !alive) picture.dispose();
          else show(picture, null);
        },
        // A failed poster is not a failed screen: the video decides.
        () => undefined,
      );
    }

    // What a video that broke shows instead: the poster, loaded once more (it was freed when the video replaced
    // it), or the solid colour when there is no poster or it does not load.
    const fallBack = () => {
      if (!poster) {
        showSolid();
        return;
      }
      loadImage(
        poster,
        (texture) => {
          const picture = mappable(texture);
          if (picture) show(picture, null);
          else showSolid();
        },
        showSolid,
      );
    };

    video.addEventListener(
      'loadeddata',
      () => {
        if (!alive) return;
        playing = true;
        const texture = new VideoTexture(video);
        texture.colorSpace = SRGBColorSpace;
        if (video.videoWidth && video.videoHeight) {
          fitTexture(texture, video.videoWidth, video.videoHeight, aspect);
        }
        show(texture, video);
        video.play().catch(() => undefined);
      },
      { once: true },
    );
    video.addEventListener(
      'error',
      () => {
        if (!alive) return;
        if (playing) {
          // A video that breaks while it plays stops, and the poster (or the solid colour) takes its place.
          playing = false;
          video.pause();
          fallBack();
          return;
        }
        // Before a picture: a poster already on screen stays; otherwise the screen shows its solid colour.
        if (!shown) showSolid();
      },
      { once: true },
    );
    video.src = src;
    return cleanup;
  }, [kind, src, poster, aspect]);

  return media;
}
