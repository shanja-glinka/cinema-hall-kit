import { readFileSync } from 'node:fs';
import { parseHallConfig, type HallConfig } from '@cinema-hall/core';

/**
 * The reference hall (Meridian Hall 3) with its comments, as the core tests use it. The path is
 * relative to the package directory, where `vitest` runs (`pnpm --filter @cinema-hall/react`).
 */
export const fixtureText = readFileSync('../core/test/fixtures/meridian-hall-3.yaml', 'utf8');

export function loadFixture(): HallConfig {
  const parsed = parseHallConfig(fixtureText);
  if (!parsed.ok) throw new Error('the fixture hall must be structurally valid');
  return parsed.config;
}
