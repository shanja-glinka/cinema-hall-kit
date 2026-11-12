import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { Canvas } from '@react-three/fiber';
import { NeutralToneMapping } from 'three';
import { formatLabel } from '../labels/labels.js';
import { partClass, rootProps, type ResolvedOptions } from '../provider/provider.js';
import { hasWebgl } from '../scene/webgl.js';

/**
 * Props of `ViewShell`: the root element and the WebGL canvas that `SeatView` and `HallPreview`
 * share.
 */
export interface ViewShellProps {
  options: ResolvedOptions;
  rootRef: RefObject<HTMLDivElement | null>;
  /** `data-chk` of the root: `view` or `preview`. */
  dataChk: string;
  className?: string;
  style?: CSSProperties;
  maxDpr: number;
  fov: number;
  /**
   * Called once when WebGL is unavailable, or when the canvas cannot be created: no frame will ever
   * render,
   * so the view is "ready" as a fallback (the documented exception to "first rendered frame").
   */
  onUnavailable?: () => void;
  children?: ReactNode;
}

/**
 * Turns an error thrown while the canvas or its renderer is created into the WebGL fallback,
 * instead of
 * letting it unmount the host's tree.
 */
class CanvasBoundary extends Component<
  { onFailed: () => void; children?: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    this.props.onFailed();
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The root element and the canvas. Nothing is rendered before the client has checked WebGL; without
 * WebGL, or when the canvas fails, the `webglFallback` slot (or a default message) takes the place
 * of it.
 */
export function ViewShell({
  options,
  rootRef,
  dataChk,
  className,
  style,
  maxDpr,
  fov,
  onUnavailable,
  children,
}: ViewShellProps): ReactNode {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const notified = useRef(false);
  useEffect(() => {
    setWebgl(hasWebgl());
  }, []);
  const fail = useCallback(() => setWebgl(false), []);
  useEffect(() => {
    if (webgl === false && !notified.current) {
      notified.current = true;
      onUnavailable?.();
    }
  }, [webgl, onUnavailable]);

  const base = partClass(options, 'view', 'chk-view');
  const root = rootProps(options, {
    className: [base, className].filter(Boolean).join(' '),
    style,
  });
  const max = Math.max(1, maxDpr);

  return (
    <div ref={rootRef} data-chk={dataChk} {...root}>
      {webgl === true ? (
        <CanvasBoundary onFailed={fail}>
          <Canvas
            className="chk-view-canvas"
            frameloop="demand"
            dpr={[1, max]}
            camera={{ fov, near: 0.05, far: 150, position: [0, 1.2, 8] }}
            gl={{ antialias: true }}
            onCreated={({ gl }) => {
              gl.toneMapping = NeutralToneMapping;
              gl.toneMappingExposure = 1;
            }}
          >
            {children}
          </Canvas>
        </CanvasBoundary>
      ) : null}
      {webgl === false ? <WebglFallback options={options} /> : null}
    </div>
  );
}

function WebglFallback({ options }: { options: ResolvedOptions }): ReactNode {
  const message = formatLabel(options.labels.picker.webglUnavailable);
  const Slot = options.slots.webglFallback;
  if (Slot) return <Slot message={message} />;
  return (
    <div className="chk-view-fallback" data-chk="webgl-fallback" role="status">
      {message}
    </div>
  );
}
