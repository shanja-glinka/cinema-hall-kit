import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { HallConfigSchema, type HallConfig } from '../src/schema.js';

export const fixtureText = readFileSync(
  fileURLToPath(new URL('./fixtures/meridian-hall-3.yaml', import.meta.url)),
  'utf8',
);

/** The fixture as a typed, validated config. */
export function fixtureConfig(): HallConfig {
  return HallConfigSchema.parse(parse(fixtureText));
}

/** An untyped deep copy of the fixture, for building deliberately invalid inputs. */
export function fixtureRaw() {
  return JSON.parse(JSON.stringify(parse(fixtureText)));
}
