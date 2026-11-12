let cached: boolean | null = null;

/**
 * Whether this browser can create a WebGL 2 context. three 0.187 renders with WebGL 2 only, so a WebGL 1
 * context is not enough. Probed once, on the client only.
 */
export function hasWebgl(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    cached = Boolean(canvas.getContext('webgl2'));
  } catch {
    cached = false;
  }
  return cached;
}
