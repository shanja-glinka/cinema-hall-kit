import { describe, expect, it } from 'vitest';
import { planAvatars, splitHeads } from '../../src/scene/avatar-plan.js';
import type { Avatars } from '@cinema-hall/core';
import { fixtureLayout } from './fixtures.js';

const seats = fixtureLayout.seats.slice(0, 3);

describe('avatar heads', () => {
  it('draws a sprite only for a photo that has loaded', () => {
    const avatars: Avatars = {};
    const [first, second] = seats;
    if (!first || !second) throw new Error('fixture has too few seats');
    avatars[first.key] = { imageUrl: 'a.png' };
    avatars[second.key] = { imageUrl: 'b.png' };
    const specs = planAvatars(seats, avatars);
    const split = splitHeads(specs, new Set([first.key]));
    expect(split.sprites.map((spec) => spec.key)).toEqual([first.key]);
    expect(split.heads.map((spec) => spec.key)).toEqual(seats.slice(1).map((seat) => seat.key));
  });

  it('keeps the sphere of a photo that is still loading in the shared batch', () => {
    const avatars: Avatars = {};
    const [first] = seats;
    if (!first) throw new Error('fixture has no seats');
    avatars[first.key] = { imageUrl: 'a.png' };
    const split = splitHeads(planAvatars(seats, avatars), new Set());
    expect(split.sprites).toHaveLength(0);
    expect(split.heads).toHaveLength(seats.length);
  });

  it('gives at most 32 loaded photos a sprite', () => {
    const avatars: Avatars = {};
    for (const seat of fixtureLayout.seats) avatars[seat.key] = { imageUrl: `${seat.key}.png` };
    const specs = planAvatars(fixtureLayout.seats, avatars);
    const loaded = new Set(fixtureLayout.seats.map((seat) => seat.key));
    const split = splitHeads(specs, loaded);
    expect(split.sprites).toHaveLength(32);
    expect(split.heads).toHaveLength(fixtureLayout.seats.length - 32);
  });
});
