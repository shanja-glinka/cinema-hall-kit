import type { ValidationRule } from '../../validation.js';
import { fitDepthRule } from './fit-depth.js';
import { fitHeadroomRule } from './fit-headroom.js';
import { fitScreenHeightRule } from './fit-screen-height.js';
import { fitScreenWidthRule } from './fit-screen-width.js';
import { fitWidthRule } from './fit-width.js';
import { layoutBandOverlapRule } from './layout-band-overlap.js';
import { layoutAisleRule } from './layout-aisle.js';
import { rowsLegroomRule } from './rows-legroom.js';
import { rowsPitchRule } from './rows-pitch.js';
import { viewFirstRowTooCloseRule } from './view-first-row-too-close.js';
import { viewFrontRowVerticalRule } from './view-front-row-vertical.js';
import { viewSightlineRule } from './view-sightline.js';
import { viewOverhangRule } from './view-overhang.js';
import { pricingMissingTierRule } from './pricing-missing-tier.js';

/** Every built-in semantic rule, in the order their issues are reported. */
export const builtInRules: ValidationRule[] = [
  fitWidthRule,
  fitDepthRule,
  fitScreenWidthRule,
  fitScreenHeightRule,
  fitHeadroomRule,
  rowsLegroomRule,
  rowsPitchRule,
  layoutAisleRule,
  layoutBandOverlapRule,
  viewFirstRowTooCloseRule,
  viewFrontRowVerticalRule,
  viewSightlineRule,
  viewOverhangRule,
  pricingMissingTierRule,
];
