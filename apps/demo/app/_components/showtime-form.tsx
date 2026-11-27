'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { dateOption } from '@/lib/shared/dates';
import {
  GENERATOR_LIMITS,
  addDays,
  formOccupancyPercent,
  normalizeTime,
  planSessions,
  splitTimes,
  type GeneratorPlan,
} from '@/lib/shared/generator';
import type { GeneratorInput, TierView } from '@/lib/shared/types';
import { t } from '@/lib/shared/texts';
import './showtime-form.css';

const FORMAT_SUGGESTIONS = ['2D', '3D', 'LUX'];
const DEFAULT_FORMATS: Record<string, string> = { '12:00': '2D', '18:30': 'LUX' };
/**
 * "Seats occupied" starts at 0: an administrator creating a showtime must not get pretend sales by
 * accident. The demo simulation is opt-in, under its own disclosure.
 */
export const FORM_OCCUPANCY_PERCENT = 0;

export interface ShowtimeForm {
  /** `false`: one day (`to` is `from`); `true`: a range of days. */
  multiDay: boolean;
  from: string;
  /** The last day: `from` in one-day mode. */
  to: string;
  timesText: string;
  formats: Record<string, string>;
  prices: Record<string, string>;
  occupancy: string;
  setMultiDay(value: boolean): void;
  setFrom(value: string): void;
  setTo(value: string): void;
  setTimesText(value: string): void;
  setFormat(time: string, value: string): void;
  setPrice(tier: string, value: string): void;
  setOccupancy(value: string): void;
  /** The generator input, or `null` when no time is entered (a hall without showtimes). */
  generator: GeneratorInput | null;
  /** The plan for the hall's tiers, or `null` without tiers or times. */
  plan: GeneratorPlan | null;
}

/**
 * State of the showtime generator form: dates, times, formats, price overrides and the mock's
 * occupancy, and the plan of the showtimes it describes (the same `planSessions` the server runs).
 * It starts with one day, tomorrow, and no pretend sales; "Several days" adds a last day.
 * @param today The server's today, `YYYY-MM-DD`.
 * @param tiers Price tiers of the hall, or `null` while there is no valid hall.
 * @param initialTimes The times the form starts with.
 * @returns The form state and its plan.
 */
export function useShowtimeForm(
  today: string,
  tiers: readonly TierView[] | null,
  initialTimes = '12:00, 18:30',
): ShowtimeForm {
  const [multiDay, setMultiDayState] = useState(false);
  const [from, setFromState] = useState(() => addDays(today, 1));
  const [lastDay, setTo] = useState(() => addDays(today, 1));
  const to = multiDay ? lastDay : from;
  const [timesText, setTimesText] = useState(initialTimes);
  const [formats, setFormats] = useState<Record<string, string>>(DEFAULT_FORMATS);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [occupancy, setOccupancy] = useState(String(FORM_OCCUPANCY_PERCENT));

  const setFrom = (value: string): void => {
    setFromState(value);
    if (value === '') return;
    // The last day follows the first one when it would be before it or too far after it.
    setTo((current) =>
      current < value || current > addDays(value, GENERATOR_LIMITS.days - 1) ? value : current,
    );
  };

  const setMultiDay = (value: boolean): void => {
    setMultiDayState(value);
    // "Several days" starts with two days, so the choice shows at once in the plan.
    if (value && from !== '') setTo((current) => (current <= from ? addDays(from, 1) : current));
  };

  const generator: GeneratorInput | null = useMemo(() => {
    if (splitTimes(timesText).length === 0) return null;
    // Price drafts of tiers that the current hall does not have are left out: their inputs are
    // not on the page any more, so they could neither be fixed nor cleared.
    const knownTiers = new Set(tiers?.map((tier) => tier.tier));
    return {
      from,
      to,
      slots: splitTimes(timesText).map((token) => {
        const time = normalizeTime(token) ?? token;
        return { time, format: formats[time] ?? formats[token] ?? '2D' };
      }),
      prices: Object.fromEntries(Object.entries(prices).filter(([tier]) => knownTiers.has(tier))),
      // A cleared field is no pretend sales, as the field starts; never the API's legacy default.
      occupancyPercent: formOccupancyPercent(occupancy),
    };
  }, [tiers, from, to, timesText, formats, prices, occupancy]);

  const plan = useMemo(
    () => (tiers && generator ? planSessions('preview', generator, tiers, today) : null),
    [tiers, generator, today],
  );

  return {
    multiDay,
    from,
    to,
    timesText,
    formats,
    prices,
    occupancy,
    setMultiDay,
    setFrom,
    setTo,
    setTimesText,
    setFormat: (time, value) => setFormats((current) => ({ ...current, [time]: value })),
    setPrice: (tier, value) => setPrices((current) => ({ ...current, [tier]: value })),
    setOccupancy,
    generator,
    plan,
  };
}

interface ShowtimeFieldsProps {
  form: ShowtimeForm;
  today: string;
  tiers: readonly TierView[] | null;
  /** Extra fields shown first in the grid (the cinema name on the upload page). */
  children?: ReactNode;
  /** Shown instead of the price fields while there are no tiers. */
  noTiersText?: string;
}

interface DateFieldProps {
  label: string;
  value: string;
  min: string;
  /** The last day the calendar offers; none when any later day can be chosen. */
  max?: string;
  onChange: (value: string) => void;
  testId: string;
}

/**
 * A day: the browser's own date picker (a calendar), with the chosen day written out next to it the
 * way the rest of the demo names days (`Sat, Nov 28`), whatever format the browser uses.
 */
function DateField({ label, value, min, max, onChange, testId }: DateFieldProps) {
  const id = useId();
  // The written-out day is outside the label, so the field's name is just "Date".
  return (
    <div className="field date-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        required
        aria-describedby={`${id}-day`}
        onChange={(event) => onChange(event.target.value)}
      />
      <small id={`${id}-day`} className="date-readout" data-testid={testId} aria-live="polite">
        {value ? dateOption(value) : ''}
      </small>
    </div>
  );
}

/**
 * The fields of the showtime generator: one day (the default) or several days, each picked with
 * a calendar; times; and, under "Demo simulation", the share of seats shown as already sold.
 * @param props The form state, the server's today and the hall's tiers.
 * @returns The fields, the plan summary and the plan error.
 */
export function ShowtimeFields({ form, today, tiers, children, noTiersText }: ShowtimeFieldsProps) {
  const texts = t.showtimeForm;
  const times = splitTimes(form.timesText);
  const planError = form.plan && !form.plan.ok ? form.plan : null;
  // The first day has no last date: the plan accepts any day from today, typed or picked. The last
  // day of a range is limited to the range the plan accepts.
  const lastOfRange = form.from === '' ? undefined : addDays(form.from, GENERATOR_LIMITS.days - 1);
  const tomorrow = addDays(today, 1);
  return (
    <>
      <fieldset className="day-mode" data-testid="day-mode">
        <legend>{texts.daysLegend}</legend>
        <label className="choice">
          <input
            type="radio"
            name="day-mode"
            checked={!form.multiDay}
            onChange={() => form.setMultiDay(false)}
          />
          {texts.oneDay}
        </label>
        <label className="choice">
          <input
            type="radio"
            name="day-mode"
            checked={form.multiDay}
            onChange={() => form.setMultiDay(true)}
          />
          {texts.severalDays}
        </label>
      </fieldset>
      <div className="form-grid">
        {children}
        <DateField
          label={form.multiDay ? texts.fromDate : texts.date}
          value={form.from}
          min={today}
          onChange={form.setFrom}
          testId="date-readout"
        />
        {form.multiDay ? (
          <DateField
            label={texts.throughDate}
            value={form.to}
            min={form.from || today}
            max={lastOfRange}
            onChange={form.setTo}
            testId="through-readout"
          />
        ) : (
          <div className="field quick-days" role="group" aria-label={texts.quickDays}>
            <span aria-hidden="true">&nbsp;</span>
            <div className="actions">
              <button
                type="button"
                className="button secondary small"
                aria-pressed={form.from === today}
                onClick={() => form.setFrom(today)}
              >
                {texts.today}
              </button>
              <button
                type="button"
                className="button secondary small"
                aria-pressed={form.from === tomorrow}
                onClick={() => form.setFrom(tomorrow)}
              >
                {texts.tomorrow}
              </button>
            </div>
          </div>
        )}
        <label className="field">
          <span>{texts.times}</span>
          <input
            type="text"
            value={form.timesText}
            onChange={(event) => form.setTimesText(event.target.value)}
            placeholder="10:00, 13:30, 17:00, 20:30"
          />
        </label>
      </div>
      <p className="muted field-hint">{texts.hint}</p>

      {times.length > 0 ? (
        <fieldset className="formats">
          <legend>{texts.formatLegend}</legend>
          <datalist id="format-suggestions">
            {FORMAT_SUGGESTIONS.map((format) => (
              <option key={format} value={format} />
            ))}
          </datalist>
          {times.map((token) => {
            const time = normalizeTime(token) ?? token;
            return (
              <label className="field" key={token}>
                <span>{texts.format(time)}</span>
                <input
                  type="text"
                  list="format-suggestions"
                  maxLength={16}
                  value={form.formats[time] ?? form.formats[token] ?? '2D'}
                  onChange={(event) => form.setFormat(time, event.target.value)}
                />
              </label>
            );
          })}
        </fieldset>
      ) : null}

      {tiers ? (
        <fieldset className="formats">
          <legend>{texts.pricesLegend}</legend>
          {tiers.map((tier) => (
            <label className="field" key={tier.tier}>
              <span>{texts.price(tier.label)}</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.prices[tier.tier] ?? ''}
                placeholder={tier.price === null ? texts.noPrice : String(tier.price)}
                onChange={(event) => form.setPrice(tier.tier, event.target.value)}
              />
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="muted">{noTiersText ?? texts.noTiers}</p>
      )}

      <details className="demo-sim" data-testid="demo-simulation">
        <summary>{texts.demoSimulation}</summary>
        <p className="muted field-hint">{texts.demoSimulationText}</p>
        <label className="field">
          <span>{texts.occupancy}</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={form.occupancy}
            onChange={(event) => form.setOccupancy(event.target.value)}
          />
        </label>
      </details>

      {planError ? (
        <p className="form-error" role="alert" data-field={planError.field}>
          {planError.message}
        </p>
      ) : null}
      {form.plan && form.plan.ok ? (
        <p className="plan" data-testid="plan">
          {texts.plan(form.plan.specs.length)}
          {form.plan.specs[0]
            ? texts.planFirst(dateOption(form.plan.specs[0].date), form.plan.specs[0].time)
            : ''}
        </p>
      ) : null}
    </>
  );
}
