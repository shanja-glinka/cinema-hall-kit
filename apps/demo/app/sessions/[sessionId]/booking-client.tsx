'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  formatPrice,
  parseHallConfig,
  selectionRules,
  type BookContext,
  type BookResult,
  type HallConfig,
  type ScreenContent,
  type SeatKey,
} from '@cinema-hall/core';
import { SeatPicker, type SelectionMode, type ViewState } from '@cinema-hall/react';
import { LOCALE, t } from '@/lib/shared/texts';
import { clockOffsetMs, remainingMs } from '@/lib/shared/clock';
import { backTarget, readOrigin, type BackTarget } from '@/lib/shared/back-link';
import { loadConsistent } from '@/lib/shared/live-sync';
import {
  bookingPanel,
  holdForPurchase,
  type BookingPanel,
  quotePrices,
  restorableHold,
  seatsInOwnHolds,
  seatsToBuy,
  sendPurchase,
  unpricedSeats,
} from '@/lib/shared/own-hold';
import { demoLabels } from '@/lib/shared/demo-labels';
import { explainRefusal } from '@/lib/shared/selection-refusal';
import { sampleTextsFor } from '@/lib/shared/sample-texts';
import { bookingLayout } from '@/lib/shared/booking-layout';
import {
  isHoldData,
  isOccupancyResponse,
  isSessionConfigResponse,
  type OccupancyResponse,
  type OwnTicket,
  type ShowtimeChip,
} from '@/lib/shared/types';
import { sessionStore } from '@/lib/shared/browser-storage';
import { holdSeats, purchaseSeats } from './actions';

/** The picker's purchase callback, typed from its props (the package may not export the names yet). */
type ConfirmHandler = NonNullable<ComponentProps<typeof SeatPicker>['onConfirm']>;
type ConfirmAnswer = Awaited<ReturnType<ConfirmHandler>>;

const POLL_INTERVAL_MS = 3000;
const RESYNC_DELAY_MS = 200;

// Module-level constants: the picker compares props by identity.
const SCREEN: ScreenContent = { kind: 'image', src: '/screen/dunes.svg' };
/** The most seats one reservation may have (the server allows as many). */
const MAX_SEATS = 6;
const SELECTION: SelectionMode = {
  mode: 'multiple',
  max: MAX_SEATS,
  rules: [selectionRules.noSingleGap()],
};

interface BookingClientProps {
  config: HallConfig;
  /** Revision of the hall version `config` belongs to. */
  versionRev: number;
  sessionId: string;
  /** The hall of the session: the back link leads to its showtimes by default. */
  hallId: string;
  /** Absent for halls that were uploaded without a cinema name. */
  cinema?: string;
  hallName: string;
  /** One of the halls the demo ships: older label wording is shown in its current form. */
  sample?: boolean;
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
  hallId,
  cinema,
  hallName,
  sample = false,
  dateLabel,
  format,
  showtimes,
}: BookingClientProps) {
  const router = useRouter();
  // The way back: where the showtime was opened from (read after mount: it is in sessionStorage).
  const [back, setBack] = useState<BackTarget>(() => backTarget(null, hallId));
  useEffect(() => {
    setBack(backTarget(readOrigin(sessionStore(), { sessionId, hallId }), hallId));
  }, [sessionId, hallId]);
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
  // The selected seats. Held here so a reservation the server still keeps for this viewer (by the
  // viewer cookie) is selected again when the page is reopened, with its countdown and purchase step.
  const [selected, setSelected] = useState<SeatKey[]>([]);
  const restored = useRef(false);
  // The hall the page draws. It changes when the session is moved to another version of the hall.
  const [config, setConfig] = useState(initialConfig);
  // Sample texts ("Lounge") in their current wording ("Lounge (recliners)"); only in sample halls.
  const shownConfig = useMemo(() => sampleTextsFor(config, sample), [config, sample]);
  // The layout the picker draws and prices seats with: the quote a purchase is bound to comes from
  // it. Built like the server's copy (`enforce: true`), so the balcony slabs and railings the viewer
  // sees from a seat have the sizes the server checked. Sample texts change labels only.
  const layout = useMemo(() => bookingLayout(shownConfig), [shownConfig]);
  const configRev = useRef(versionRev);
  const [hallUpdated, setHallUpdated] = useState(false);
  // Server time minus browser time, for the hold countdown.
  const [clockOffset, setClockOffset] = useState(0);
  // The ticket of a purchase made on this page, until the occupancy answer lists it too. A purchase
  // whose answer was lost needs nothing here: the server lists the viewer's tickets with the
  // occupancy (`ownTickets`), so the ticket shows up with the next answer, after a reload as well.
  const [bought, setBought] = useState<OwnTicket | null>(null);
  // Holds whose ticket the viewer closed on this page.
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const tickets = useMemo(() => {
    const listed = snapshot?.ownTickets ?? [];
    return bought && !listed.some((entry) => entry.holdId === bought.holdId)
      ? [bought, ...listed]
      : listed;
  }, [bought, snapshot]);
  const panel = bookingPanel(hold, tickets, closed);
  // Selected seats without a price at this showtime (a move to another version of the hall can
  // take a reserved seat's price away). The server refuses to sell them every time, so confirming
  // is turned off while one is selected and the page says which seats are in the way.
  // Seats the viewer has already bought are not bought again, so only the others count.
  const unpriced = useMemo(
    () => unpricedSeats(layout, snapshot?.pricing, seatsToBuy(selected, tickets)),
    [layout, snapshot, selected, tickets],
  );
  const unpricedLabels = useMemo(() => {
    const labels = new Map(layout.seats.map((seat) => [seat.key, seat.label] as const));
    return unpriced.map((key) => labels.get(key) ?? key);
  }, [layout, unpriced]);

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
          if (!restored.current) {
            // Once per page: the viewer's own active reservation comes back with its seats, so the
            // purchase can be completed after a reload. A selection made meanwhile is kept.
            restored.current = true;
            const serverNow = Date.parse(synced.snapshot.occupancy.serverNow ?? '');
            const own = restorableHold(
              synced.snapshot.ownHolds,
              Number.isFinite(serverNow) ? serverNow : Date.now(),
            );
            if (own) {
              setSelected((current) => (current.length === 0 ? own.keys : current));
              setHold((current) => current ?? { holdId: own.holdId, expiresAt: own.expiresAt });
            }
          }
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
      // A selection that mixes new seats with seats of a reservation the viewer already has (one
      // restored after a reload) would be refused as a whole, and the picker would then drop the
      // reserved seats. It is not sent: the reservation is bought or released first. The picker
      // shows the explanation in place of its generic error and keeps the selection.
      if (seatsInOwnHolds(keys, snapshot?.ownHolds, Date.now() + clockOffset).length > 0) {
        return { ok: false, reason: 'error', message: t.booking.reserveWithHeld, retryable: false };
      }
      try {
        const result = await holdSeats(sessionId, keys, {
          attemptId: context.attemptId,
          prices: context.prices,
        });
        // A rule the server checks again (seats around the selection may have changed since the
        // picker's own check) comes back as a code: the viewer gets the picker's sentence for it.
        return explainRefusal(result, demoLabels.picker, { max: MAX_SEATS });
      } finally {
        setRefreshToken((token) => token + 1);
      }
    },
    [sessionId, snapshot, clockOffset],
  );

  const handleBooked = useCallback((result: Extract<BookResult, { ok: true }>) => {
    if (!isHoldData(result.data)) return;
    setHold({ holdId: result.data.holdId, expiresAt: result.hold?.expiresAt ?? null });
  }, []);

  // The demo purchase: the confirmed seats of the hold become sold seats and a ticket. No payment.
  const handleConfirm = useCallback<ConfirmHandler>(
    async (keys, context): Promise<ConfirmAnswer> => {
      // One reservation has to cover every confirmed seat: a selection that spans two reservations
      // (reserve, deselect, reserve others, select the first again) cannot be bought through either.
      const known = isHoldData(context.booking) ? context.booking.holdId : hold?.holdId;
      const target = holdForPurchase(keys, snapshot?.ownHolds, known);
      if (target.kind === 'split') {
        return { ok: false, reason: 'error', message: t.booking.purchaseSplit };
      }
      if (target.kind === 'none') {
        return { ok: false, reason: 'error', message: t.booking.noReservation };
      }
      const holdId = target.holdId;
      // A seat without a price cannot be bought, however often it is confirmed.
      const missing = unpricedSeats(layout, snapshot?.pricing, keys);
      if (missing.length > 0) {
        const labels = new Map(layout.seats.map((seat) => [seat.key, seat.label] as const));
        return {
          ok: false,
          reason: 'error',
          message: t.booking.priceUnavailable(missing.map((key) => labels.get(key) ?? key)),
        };
      }
      try {
        // Exactly the seats the viewer confirmed, at the prices on the button: seats of the hold that
        // were deselected since the reservation are released, not sold, and a changed price sells
        // nothing.
        const prices = quotePrices(layout, snapshot?.pricing, keys);
        // Sent again when no answer arrives: the server sells a reservation once and answers a
        // repeat with the same ticket, so nothing is bought twice.
        const result = await sendPurchase(() => purchaseSeats(sessionId, holdId, keys, prices));
        if (result === null) {
          // Still no answer: the seats may have been bought or not. If they were, the ticket comes
          // with the next occupancy answer; if not, confirming again buys them, once.
          return { ok: false, reason: 'error', message: t.booking.purchaseUnknown };
        }
        if (result.ok) {
          setBought({ holdId, ticket: result.ticket });
          setHold((current) =>
            current?.holdId === holdId ? current : { holdId, expiresAt: null },
          );
          return { ok: true, ticket: result.ticket.number };
        }
        // A refused selection names the broken rule.
        if (result.reason === 'selection_rule') {
          const code = result.rule;
          return {
            ok: false,
            reason: 'error',
            message:
              code === 'noSingleGap' ? t.booking.purchaseSingleGap : t.booking.purchaseRuleBroken,
          };
        }
        if (result.reason === 'price_changed') {
          return {
            ok: false,
            reason: 'error',
            message: t.booking.purchasePriceChanged(
              result.total === null ? '—' : formatPrice(result.total, LOCALE),
            ),
          };
        }
        // The reason picks a sentence for the viewer; the server's message is technical.
        const messages = {
          expired: t.booking.purchaseExpired,
          not_found: t.booking.purchaseNotFound,
          closed: t.booking.purchaseClosed,
          bad_request: t.booking.purchaseBadRequest,
        } as const;
        return {
          ok: false,
          reason: result.reason === 'expired' ? 'expired' : 'error',
          message: messages[result.reason],
        };
      } finally {
        setRefreshToken((token) => token + 1);
      }
    },
    [sessionId, hold, layout, snapshot],
  );

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
        <Link
          href={back.href}
          className="back-link"
          data-testid="booking-back"
          data-kind={back.kind}
        >
          <span aria-hidden="true">‹ </span>
          {t.booking.back[back.kind]}
        </Link>
        <header className="booking-header">
          <div className="booking-title">
            <h1>{cinema ?? hallName}</h1>
            <p>
              {cinema ? `${hallName} · ` : ''}
              {dateLabel} · {format}
            </p>
          </div>
        </header>

        <nav className="showtimes" aria-label={t.booking.showtimesNav}>
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
            {t.booking.connectionLost}
          </p>
        ) : null}
        {hallUpdated ? (
          <p className="notice" role="status" data-testid="hall-updated">
            {t.booking.hallUpdated}{' '}
            <button type="button" className="text-button" onClick={() => setHallUpdated(false)}>
              {t.booking.dismiss}
            </button>
          </p>
        ) : null}
        {unpricedLabels.length > 0 ? (
          <p className="notice" role="status" data-testid="price-unavailable">
            {t.booking.priceUnavailable(unpricedLabels)}
          </p>
        ) : null}
        {panel ? (
          <HoldPanel
            panel={panel}
            clockOffsetMs={clockOffset}
            onDismiss={() => {
              setHold(null);
              // Closing a ticket closes the older ones too: none of them comes back in its place.
              setClosed(new Set(tickets.map((entry) => entry.holdId)));
            }}
          />
        ) : null}

        <div className="picker">
          <SeatPicker
            className="picker-root"
            layoutMode="contained"
            layout={layout}
            occupancy={snapshot?.occupancy}
            pricing={snapshot?.pricing}
            screen={SCREEN}
            selection={SELECTION}
            value={selected}
            onValueChange={setSelected}
            view={view}
            onViewChange={handleViewChange}
            onInvalidView={handleInvalidView}
            onBook={handleBook}
            onBooked={handleBooked}
            onConfirm={unpriced.length > 0 ? undefined : handleConfirm}
          />
        </div>
      </div>
    </main>
  );
}

function HoldPanel({
  panel,
  clockOffsetMs: offsetMs,
  onDismiss,
}: {
  panel: BookingPanel;
  clockOffsetMs: number;
  onDismiss: () => void;
}) {
  const texts = t.booking;
  const now = useNow(1000);
  const ticket = panel.kind === 'ticket' ? panel.ticket : null;
  const remaining = panel.kind === 'hold' ? remainingMs(panel.expiresAt, now, offsetMs) : null;
  const expired = remaining === 0;
  return (
    <section
      className="hold-panel"
      aria-label={texts.region}
      data-state={ticket ? 'purchased' : expired ? 'expired' : 'held'}
    >
      <div>
        {ticket ? (
          <>
            <strong>{texts.purchased(ticket.number)}</strong>
            <p>{texts.purchasedText(ticket.seats.join(', '))}</p>
          </>
        ) : expired ? (
          <>
            <strong>{texts.expired}</strong>
            <p>{texts.expiredText}</p>
          </>
        ) : (
          <>
            <strong>
              {remaining === null ? texts.reserved : texts.reservedFor(formatRemaining(remaining))}
            </strong>
            <p>{texts.reservedText}</p>
          </>
        )}
      </div>
      <button type="button" className="text-button" onClick={onDismiss}>
        {texts.close}
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
