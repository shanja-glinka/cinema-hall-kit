/** Sizes for new bands and for the one-click "Make the hall … deep/wide" fix. */
import { describe, expect, it } from 'vitest';
import {
  parseHallConfig,
  resolveConstraints,
  validateHall,
  type HallConfig,
  buildHallLayout,
  LIMITS,
  type Issue,
} from '@cinema-hall/core';
import { addBand } from '../../src/constructor/editor/bands.js';
import { fitOverflow, fitParts } from '../../src/constructor/editor/config.js';
import { loadFixture } from './support.js';
import { issueFix } from '../../src/constructor/issues-view.js';

function parsed(value: unknown): HallConfig {
  const result = parseHallConfig(value);
  if (!result.ok) throw new Error('structurally invalid');
  return result.config;
}

/** One band of 6 seats at 0.6 m; 10 seats at that pitch need the hall 2 mm wider than it is. */
function nearlyWideEnough(): HallConfig {
  const fixture = loadFixture();
  const clearance = resolveConstraints(fixture).minWallClearance;
  const first = fixture.layout.bands[0]!;
  return parsed({
    ...fixture,
    hall: { ...fixture.hall, width: 10 * 0.6 + 2 * clearance - 0.002 },
    screen: { ...fixture.screen, width: 5 },
    layout: {
      ...fixture.layout,
      bands: [
        {
          ...first,
          defaults: { ...first.defaults, seatPitch: 0.6 },
          sections: [{ id: 'centre', seatsPerRow: 6 }],
        },
      ],
    },
  });
}

const fitErrors = (config: HallConfig) =>
  validateHall(config).filter((issue) => issue.code === 'fit.width' || issue.code === 'fit.depth');

const depthIssue = (required: number): Issue => ({
  severity: 'error',
  code: 'fit.depth',
  path: ['hall', 'depth'],
  params: { required, available: 20 },
});

/** A hall whose seats need `need` metres of depth (through the rear clearance). */
function hallNeeding(need: number) {
  const config = loadFixture();
  const layout = buildHallLayout(config);
  const reach = Math.max(
    ...layout.seats.map((seat) => seat.position.z + layout.seatTypes[seat.seatTypeId]!.depth / 2),
  );
  const constraints = { minRearClearance: need - reach };
  const issue = validateHall(config, { constraints }).find((item) => item.code === 'fit.depth');
  return { config, constraints, issue: issue! };
}

describe('fitting a new band uses the unrounded dimensions', () => {
  it('a row 2 mm too wide counts as overflowing, although both rounded values read the same', () => {
    const config = nearlyWideEnough();
    expect(fitErrors(config)).toEqual([]);
    const tooWide = parsed({
      ...config,
      layout: {
        ...config.layout,
        bands: [{ ...config.layout.bands[0]!, sections: [{ id: 'centre', seatsPerRow: 10 }] }],
      },
    });
    const [issue] = fitErrors(tooWide);
    expect(issue?.code).toBe('fit.width');
    expect(issue?.params?.required).toBe(issue?.params?.available);
    expect(fitParts(tooWide)!.width).toBeCloseTo(0.002, 6);
    expect(fitOverflow(tooWide)).toBeCloseTo(0.002, 6);
  });

  it('Add band takes fewer seats instead of a row that does not fit', () => {
    const config = nearlyWideEnough();
    const next = parsed(addBand(config));
    const band = next.layout.bands[1]!;
    expect(band.sections[0]!.seatsPerRow).toBe(8);
    expect(fitErrors(next)).toEqual([]);
  });
});

describe('the hall size fix never goes above the largest hall size', () => {
  it('a hall that needs 499.999 m is offered 500 m, which is valid and clears the error', () => {
    const { config, constraints, issue } = hallNeeding(499.999);
    expect(issue.params?.required).toBe(500);
    const fix = issueFix(issue, { config, constraints });
    expect(fix).toEqual({ dimension: 'depth', value: LIMITS.maxMetres });
    const fixed = { ...config, hall: { ...config.hall, depth: fix!.value } };
    expect(parseHallConfig(fixed).ok).toBe(true);
    expect(validateHall(fixed, { constraints }).some((item) => item.code === 'fit.depth')).toBe(
      false,
    );
  });

  it('a hall that needs a bit more than 500 m (shown as 500 m) gets no fix', () => {
    const { config, constraints, issue } = hallNeeding(500.004);
    expect(issue.params?.required).toBe(500);
    expect(issueFix(issue, { config, constraints })).toBeNull();
  });

  it('without the hall, a capped size is offered only when the shown need guarantees it', () => {
    // 499.99 m shown: the real need is at most 499.995 m, so 500 m clears it.
    expect(issueFix(depthIssue(499.99))).toEqual({ dimension: 'depth', value: 500 });
    // 500 m shown: the real need may be above 500 m.
    expect(issueFix(depthIssue(500))).toBeNull();
    expect(issueFix(depthIssue(501))).toBeNull();
    expect(issueFix({ ...depthIssue(612), code: 'fit.width' })).toBeNull();
    // Below the limit nothing changes.
    expect(issueFix(depthIssue(16.22))).toEqual({ dimension: 'depth', value: 16.25 });
  });

  it('no fix value ever exceeds the schema maximum', () => {
    for (const required of [499.9, 499.95, 499.96, 499.99, 499.994, 500]) {
      const fix = issueFix(depthIssue(required));
      if (fix) expect(fix.value).toBeLessThanOrEqual(LIMITS.maxMetres);
    }
  });
});
