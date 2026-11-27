import { describe, expect, it } from 'vitest';
import { validateHall, type ValidationRule } from '../src/validation.js';
import type { BandConfig, HallConfig } from '../src/schema.js';
import type { Issue, IssueCode } from '../src/issues.js';
import { fixtureConfig } from './support.js';

/** Issues with the given code, for a config whose other rules are not under test. */
const only = (
  config: HallConfig,
  code: IssueCode,
  opts: Parameters<typeof validateHall>[1] = {},
): Issue[] => validateHall(config, opts).filter((issue) => issue.code === code);

describe('fit.width', () => {
  it('flags every band that is wider than the hall minus clearances', () => {
    const config = fixtureConfig();
    config.hall.width = 12;
    const issues = only(config, 'fit.width');
    expect(issues.map((i) => i.path)).toEqual([
      ['layout', 'bands', 0],
      ['layout', 'bands', 1],
    ]);
    expect(issues[0]).toMatchObject({
      severity: 'error',
      ref: { bandId: 'main' },
      params: { required: 12.4, available: 12, band: 'Main' },
    });
  });

  it('is silent when the bands fit', () => {
    expect(only(fixtureConfig(), 'fit.width')).toEqual([]);
  });
});

describe('fit.depth', () => {
  it('flags a hall shallower than the rearmost seat plus clearance', () => {
    const config = fixtureConfig();
    config.hall.depth = 14;
    expect(only(config, 'fit.depth')).toEqual([
      expect.objectContaining({
        path: ['hall', 'depth'],
        ref: { bandId: 'recliners' },
        params: { required: 14.35, available: 14, band: 'Recliners' },
      }),
    ]);
  });

  it('is silent for the fixture depth', () => {
    expect(only(fixtureConfig(), 'fit.depth')).toEqual([]);
  });
});

describe('fit.screenWidth', () => {
  it('flags a screen wider than the hall', () => {
    const config = fixtureConfig();
    config.screen.width = 15;
    expect(only(config, 'fit.screenWidth')).toEqual([
      expect.objectContaining({
        path: ['screen', 'width'],
        params: { required: 15, available: 14 },
      }),
    ]);
  });

  it('is silent when the screen fits', () => {
    expect(only(fixtureConfig(), 'fit.screenWidth')).toEqual([]);
  });
});

describe('fit.screenHeight', () => {
  it('flags a screen whose top edge is above the ceiling', () => {
    const config = fixtureConfig();
    config.screen.elevation = 4;
    expect(only(config, 'fit.screenHeight')).toEqual([
      expect.objectContaining({
        path: ['screen', 'height'],
        params: { required: 8.8, available: 8 },
      }),
    ]);
  });

  it('is silent when the screen top is below the ceiling', () => {
    expect(only(fixtureConfig(), 'fit.screenHeight')).toEqual([]);
  });
});

describe('fit.headroom', () => {
  it('flags a ceiling lower than the highest eye point plus headroom', () => {
    const config = fixtureConfig();
    config.hall.height = 2.7;
    const issues = only(config, 'fit.headroom');
    expect(issues).toEqual([
      expect.objectContaining({
        path: ['hall', 'height'],
        params: { required: 3.15, available: 2.7, band: 'Recliners' },
      }),
    ]);
    // No band reference: following the issue opens the hall height field, not the band.
    expect(issues[0]!.ref).toBeUndefined();
  });

  it('is silent under a high ceiling', () => {
    expect(only(fixtureConfig(), 'fit.headroom')).toEqual([]);
  });

  it('is silent when no seat exists', () => {
    const config = fixtureConfig();
    for (const band of config.layout.bands)
      for (const section of band.sections)
        section.exclude = [
          'r1.s1',
          'r2.s1',
          'r3.s1',
          'r4.s1',
          'r5.s1',
          'r6.s1',
          'r7.s1',
          'r8.s1',
          'r9.s1',
        ];
    expect(only(config, 'fit.headroom')).toEqual([]);
  });
});

describe('rows.legroom', () => {
  it('flags multi-row sections with too little space between rows (deep recliners)', () => {
    const config = fixtureConfig();
    config.seatTypes.recliner!.depth = 0.9;
    const issues = only(config, 'rows.legroom');
    expect(issues.map((i) => i.ref?.sectionId)).toEqual(['rec-left', 'rec-centre', 'rec-right']);
    expect(issues[0]).toMatchObject({
      severity: 'error',
      params: { required: 0.3, available: 0.25 },
    });
  });

  it('is silent when the row spacing leaves the minimum legroom', () => {
    const config = fixtureConfig();
    config.layout.bands[1]!.defaults!.rowSpacing = 1.25;
    expect(only(config, 'rows.legroom')).toEqual([]);
  });

  it('ignores single-row sections', () => {
    const config = fixtureConfig();
    config.layout.bands[1]!.defaults!.rows = 1;
    expect(only(config, 'rows.legroom')).toEqual([]);
  });
});

describe('rows.pitch', () => {
  it('flags a seat pitch narrower than the seat', () => {
    const config = fixtureConfig();
    config.layout.bands[0]!.sections[0]!.seatPitch = 0.5;
    expect(only(config, 'rows.pitch')).toEqual([
      expect.objectContaining({
        severity: 'error',
        path: ['layout', 'bands', 0, 'sections', 0],
        params: { required: 0.55, available: 0.5, section: 'Left' },
      }),
    ]);
  });

  it('is silent when the pitch clears the seat width', () => {
    expect(only(fixtureConfig(), 'rows.pitch')).toEqual([]);
  });
});

describe('layout.aisle', () => {
  it('warns about an aisle narrower than the minimum (not for the first section)', () => {
    const config = fixtureConfig();
    config.layout.bands[0]!.sections[1]!.gapBefore = 0.5;
    config.layout.bands[0]!.sections[0]!.gapBefore = 0.2;
    expect(only(config, 'layout.aisle')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        path: ['layout', 'bands', 0, 'sections', 1],
        params: { required: 0.9, available: 0.5, section: 'Centre' },
      }),
    ]);
  });

  it('is silent for aisles of the minimum width or for no aisle', () => {
    const config = fixtureConfig();
    config.layout.bands[0]!.sections[1]!.gapBefore = 0.9;
    config.layout.bands[0]!.sections[2]!.gapBefore = 0;
    expect(only(config, 'layout.aisle')).toEqual([]);
  });
});

describe('view.firstRowTooClose', () => {
  it('warns when the first row is too close relative to the screen width', () => {
    const config = fixtureConfig();
    config.layout.firstRowDistance = 3;
    expect(only(config, 'view.firstRowTooClose')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        path: ['layout', 'firstRowDistance'],
        params: { required: 0.4, available: 0.26 },
      }),
    ]);
  });

  it('is silent at the concept distance', () => {
    expect(only(fixtureConfig(), 'view.firstRowTooClose')).toEqual([]);
  });
});

describe('view.frontRowVertical', () => {
  it('warns on the fixture: about 44 degrees against a 40 degree limit', () => {
    expect(only(fixtureConfig(), 'view.frontRowVertical')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        path: ['layout', 'firstRowDistance'],
        params: { limit: 40, actual: 44.42 },
      }),
    ]);
  });

  it('is silent when the limit is relaxed through options', () => {
    expect(
      only(fixtureConfig(), 'view.frontRowVertical', {
        constraints: { maxFrontRowVerticalAngle: 50 },
      }),
    ).toEqual([]);
  });
});

describe('view.sightline', () => {
  it('warns once per main section, at the first blocked row (fixture)', () => {
    const issues = only(fixtureConfig(), 'view.sightline');
    expect(issues).toHaveLength(3);
    for (const issue of issues) {
      expect(issue).toMatchObject({ severity: 'warning', params: { row: 3, rowLabel: 'C' } });
      expect(issue.ref?.bandId).toBe('main');
    }
  });

  it('is silent when the risers are high enough to clear the heads in front', () => {
    const config = fixtureConfig();
    config.layout.bands[0]!.riserHeight = 0.6;
    expect(only(config, 'view.sightline').filter((i) => i.ref?.bandId === 'main')).toEqual([]);
  });

  it('skips a pair of rows when one of them has no seat', () => {
    const config = fixtureConfig();
    config.layout.bands[0]!.sections[0]!.exclude = ['r3.s1', 'r3.s2', 'r3.s3'];
    const left = only(config, 'view.sightline').filter((i) => i.ref?.sectionId === 'left');
    expect(left.map((i) => i.params?.row)).not.toContain(3);
  });

  it('skips pairs when the screen curvature puts the bottom edge behind the back row', () => {
    const config = fixtureConfig();
    config.screen.curvature = 50;
    expect(only(config, 'view.sightline').filter((i) => i.ref?.bandId === 'main')).toEqual([]);
  });

  it('checks the first row of a band against the last row of the band in front', () => {
    const config = fixtureConfig();
    config.layout.bands[1]!.gapBefore = 0.95;
    config.layout.bands[1]!.riserHeight = 0;
    const issues = only(config, 'view.sightline').filter((i) => i.ref?.bandId === 'recliners');
    expect(issues.map((i) => [i.ref?.sectionId, i.params?.row])).toEqual([
      ['rec-left', 1],
      ['rec-centre', 1],
      ['rec-right', 1],
    ]);
  });
});

describe('view.sightline checks every seat in front, not only the nearest row', () => {
  /** Three one-seat bands at z 4, 5 and 6 m; the rear band's floor is raised by 0.5 m. */
  const stepped = (): HallConfig => {
    const config = fixtureConfig();
    const row = (id: string, extra: Partial<BandConfig> = {}): BandConfig => ({
      id,
      sections: [
        {
          id: `${id}-seats`,
          seatsPerRow: 1,
          rows: 1,
          rowSpacing: 1,
          seatPitch: 0.6,
          seatType: 'standard',
        },
      ],
      ...extra,
    });
    config.screen.elevation = 0.1;
    config.screen.curvature = 0;
    config.layout.eyeHeight = 1.15;
    config.layout.firstRowDistance = 4;
    config.layout.bands = [
      row('front'),
      row('middle', { gapBefore: 1 }),
      row('rear', { gapBefore: 1, riserHeight: 0.5 }),
    ];
    return config;
  };

  it('blocks the rear viewer for the head of the front row, which the middle row clears', () => {
    const issues = only(stepped(), 'view.sightline', { constraints: { headAboveEye: 0.12 } });
    expect(issues.map((issue) => [issue.ref?.bandId, issue.params?.row])).toEqual([
      ['middle', 1],
      ['rear', 1],
    ]);
  });
});

describe('validateHall options', () => {
  it('drops issues whose severity is off and re-levels the rest', () => {
    const issues = validateHall(fixtureConfig(), {
      severity: { 'view.frontRowVertical': 'off', 'view.sightline': 'error' },
    });
    expect(issues.some((i) => i.code === 'view.frontRowVertical')).toBe(false);
    expect(
      issues.filter((i) => i.code === 'view.sightline').every((i) => i.severity === 'error'),
    ).toBe(true);
  });

  it('appends extra rules and applies severity to them', () => {
    const rule: ValidationRule = {
      code: 'custom.demo',
      check: ({ config }) => [
        { severity: 'warning', code: 'custom.demo', path: ['name'], params: { name: config.name } },
      ],
    };
    expect(validateHall(fixtureConfig(), { extraRules: [rule] })).toContainEqual(
      expect.objectContaining({ code: 'custom.demo', params: { name: 'Meridian Hall 3' } }),
    );
    expect(
      validateHall(fixtureConfig(), { extraRules: [rule], severity: { 'custom.demo': 'off' } }),
    ).not.toContainEqual(expect.objectContaining({ code: 'custom.demo' }));
  });

  it('prefers opts.constraints over config.constraints over the defaults', () => {
    const config = fixtureConfig();
    config.constraints = { maxFrontRowVerticalAngle: 50 };
    expect(only(config, 'view.frontRowVertical')).toEqual([]);
    expect(
      only(config, 'view.frontRowVertical', { constraints: { maxFrontRowVerticalAngle: 30 } }),
    ).toHaveLength(1);
  });

  it('ignores config.constraints in enforce mode and uses the defaults', () => {
    const config = fixtureConfig();
    config.constraints = { maxFrontRowVerticalAngle: 50 };
    expect(only(config, 'view.frontRowVertical', { enforce: true })).toHaveLength(1);
    expect(
      only(config, 'view.frontRowVertical', {
        enforce: true,
        constraints: { maxFrontRowVerticalAngle: 50 },
      }),
    ).toEqual([]);
  });
});
