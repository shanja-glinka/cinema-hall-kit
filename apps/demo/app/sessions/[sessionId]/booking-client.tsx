'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  parseHallConfig,
  selectionRules,
  type BookContext,
  type BookResult,
  type HallConfig,
  type ScreenContent,
  type SeatKey,
} from '@cinema-hall/core';
import { SeatPicker, type SelectionMode, type ViewState } from '@cinema-hall/react';
import { clockOffsetMs, remainingMs } from '@/lib/shared/clock';
import { loadConsistent } from '@/lib/shared/live-sync';
import {
  isHoldData,
  isOccupancyResponse,
  isSessionConfigResponse,
  type OccupancyResponse,
  type ShowtimeChip,
} from '@/lib/shared/types';
import { holdSeats } from './actions';

const POLL_INTERVAL_MS = 3000;
const RESYNC_DELAY_MS = 200;

// Module-level constants: the picker compares props by identity.
const SCREEN: ScreenContent = { kind: 'image', src: '/screen/dunes.svg' };
const SELECTION: SelectionMode = {
  mode: 'multiple',
  max: 6,
  rules: [selectionRules.noSingleGap()],
};

interface BookingClientProps {
  config: HallConfig;
  /** Revision of the hall version `config` belongs to. */
  versionRev: number;
  sessionId: string;
  /** Absent for halls that were uploaded without a cinema name. */
  cinema?: string;
  hallName: string;
  dateLabel: string;
  format: string;
  showtimes: ShowtimeChip[];
}

interface HoldState {
  holdId: string;
  expiresAt: string | null;
}

export function BookingClient({
  config: initialConfig,
  versionRev,
  sessionId,
  cinema,
  hallName,
  dateLabel,
  format,
  showtimes,
}: BookingClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const seatParam = useSearchParams().get('seat');
  // The URL is the source of truth for the view: `?seat=<SeatKey>` means the 3D view.
  const view = useMemo<ViewState>(
    () => (seatParam ? { stage: 'view', seatKey: seatParam } : { stage: 'map' }),
    [seatParam],
  );

  const [snapshot, setSnapshot] = useState<OccupancyResponse | null>(null);
  const [pollFailed, setPollFailed] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [hold, setHold] = useState<HoldState | null>(null);
  // The hall the page draws. It changes when the session is moved to another version of the hall.
  const [config, setConfig] = useState(initialConfig);
  const configRev = useRef(versionRev);
  const [hallUpdated, setHallUpdated] = useState(false);
  // Server time minus browser time, for the hold countdown.
  const [clockOffset, setClockOffset] = useState(0);

  // Occupancy and pricing, polled every 3 s. A new refreshToken restarts the loop at once.
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fetchSnapshot = async (): Promise<OccupancyResponse> => {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/occupancy`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`occupancy ${response.status}`);
      const body: unknown = await response.json();
      if (!isOccupancyResponse(body)) throw new Error('occupancy: unexpected shape');
      return body;
    };
    const load = async (): Promise<void> => {
      let delay = POLL_INTERVAL_MS;
      try {
        // A snapshot is committed together with the config of its own version, or not at all.
        const synced = await loadConsistent(configRev.current, {
          fetchSnapshot,
          fetchConfig: () => loadConfig(sessionId, controller.signal),
        });
        if (controller.signal.aborted) return;
        if (synced === null) {
          // The hall kept changing under the requests: ask again at once, show nothing half-new.
          delay = RESYNC_DELAY_MS;
        } else {
          if (synced.config) {
            setConfig(synced.config.config);
            configRev.current = synced.config.hallVersionRev;
            setHallUpdated(true);
          }
          setClockOffset(clockOffsetMs(synced.snapshot.occupancy.serverNow, Date.now()));
          setSnapshot(synced.snapshot);
          setPollFailed(false);
        }
      } catch {
        if (controller.signal.aborted) return;
        setPollFailed(true);
      }
      if (!controller.signal.aborted) timer = setTimeout(() => void load(), delay);
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [sessionId, refreshToken]);

  const handleBook = useCallback(
    async (keys: SeatKey[], context: BookContext): Promise<BookResult> => {
      try {
        return await holdSeats(sessionId, keys, {
          attemptId: context.attemptId,
          prices: context.prices,
        });
      } finally {
        setRefreshToken((token) => token + 1);
      }
    },
    [sessionId],
  );

  const handleBooked = useCallback((result: Extract<BookResult, { ok: true }>) => {
    if (!isHoldData(result.data)) return;
    setHold({ holdId: result.data.holdId, expiresAt: result.hold?.expiresAt ?? null });
  }, []);

  const handleViewChange = useCallback(
    (next: ViewState) => {
      const href =
        next.stage === 'view' ? `${pathname}?seat=${encodeURIComponent(next.seatKey)}` : pathname;
      router.replace(href, { scroll: false });
    },
    [pathname, router],
  );

  const handleInvalidView = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return (
    <main className="booking-page">
      <div className="phone">
        <header className="booking-header">
          <Link href="/" className="icon-button" aria-label="Home">
            ‹
          </Link>
          <div className="booking-title">
            <h1>{cinema ?? hallName}</h1>
            <p>
              {cinema ? `${hallName} · ` : ''}
              {dateLabel} · {format}
            </p>
          </div>
          <span className="icon-spacer" aria-hidden="true" />
        </header>

        <nav className="showtimes" aria-label="Showtimes for this day">
          {showtimes.map((show) => {
            const active = show.id === sessionId;
            return (
              <Link
                key={show.id}
                href={`/sessions/${show.id}`}
                className="showtime"
                aria-current={active ? 'page' : undefined}
              >
                <span className="showtime-time">{show.time}</span>
                <small>{show.format}</small>
              </Link>
            );
          })}
        </nav>

        {pollFailed ? (
          <p className="notice" role="status">
            Connection lost. Retrying…
          </p>
        ) : null}
        {hallUpdated ? (
          <p className="notice" role="status" data-testid="hall-updated">
            Hall updated: this showtime moved to a new version.{' '}
            <button type="button" className="text-button" onClick={() => setHallUpdated(false)}>
              Dismiss
            </button>
          </p>
        ) : null}
        {hold ? (
          <HoldPanel hold={hold} clockOffsetMs={clockOffset} onDismiss={() => setHold(null)} />
        ) : null}

        <div className="picker">
          <SeatPicker
            className="picker-root"
            layoutMode="contained"
            config={config}
            occupancy={snapshot?.occupancy}
            pricing={snapshot?.pricing}
            screen={SCREEN}
            selection={SELECTION}
            view={view}
            onViewChange={handleViewChange}
            onInvalidView={handleInvalidView}
            onBook={handleBook}
            onBooked={handleBooked}
          />
        </div>
      </div>
    </main>
  );
}

function HoldPanel({
  hold,
  clockOffsetMs: offsetMs,
  onDismiss,
}: {
  hold: HoldState;
  clockOffsetMs: number;
  onDismiss: () => void;
}) {
  const now = useNow(1000);
  const remaining = remainingMs(hold.expiresAt, now, offsetMs);
  const expired = remaining === 0;
  return (
    <section className="hold-panel" aria-label="Booking">
      <div>
        <strong>{expired ? 'Hold expired' : 'Seats booked'}</strong>
        <p>
          № {hold.holdId.slice(0, 8)}
          {remaining === null || expired ? null : ` · ${formatRemaining(remaining)} remaining`}
        </p>
      </div>
      <button type="button" className="text-button" onClick={onDismiss}>
        Close
      </button>
    </section>
  );
}

/** The hall config of the version the session is pinned to now, checked before it is drawn. */
async function loadConfig(
  sessionId: string,
  signal: AbortSignal,
): Promise<{ config: HallConfig; hallVersionRev: number }> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/config`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error(`config ${response.status}`);
  const body: unknown = await response.json();
  if (!isSessionConfigResponse(body)) throw new Error('config: unexpected shape');
  const parsed = parseHallConfig(body.config);
  if (!parsed.ok) throw new Error('config: not a valid hall');
  return { config: parsed.config, hallVersionRev: body.hallVersionRev };
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}
