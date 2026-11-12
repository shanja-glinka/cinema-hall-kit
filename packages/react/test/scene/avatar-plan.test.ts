import { describe, expect, it } from 'vitest';
import type { Avatars } from '@cinema-hall/core';
import {
  avatarOptionsOf,
  EMPTY_AVATAR,
  planAvatars,
  takenSeats,
} from '../../src/scene/avatar-plan.js';
import { AVATAR_PALETTE, BODY_CENTRE, HEAD_BASE, HEAD_JITTER } from '../../src/scene/math.js';
import { fixtureLayout } from './fixtures.js';

const seats = fixtureLayout.seats;

describe('avatar placement', () => {
  it('seats the body on the cushion and the head at the jittered height', () => {
    const [first] = planAvatars(seats.slice(0, 1), undefined);
    const seat = seats[0]!;
    expect(first).toBeDefined();
    expect(first!.bodyPosition.y).toBeCloseTo(seat.position.y + BODY_CENTRE, 9);
    expect(first!.bodyPosition.x).toBe(seat.position.x);
    expect(first!.headPosition.y - seat.position.y - HEAD_BASE).toBeLessThanOrEqual(HEAD_JITTER);
    expect(Math.abs(first!.headPosition.y - seat.position.y - HEAD_BASE)).toBeLessThanOrEqual(
      HEAD_JITTER,
    );
  });

  it('is deterministic for the same input', () => {
    expect(planAvatars(seats, undefined)).toEqual(planAvatars(seats, undefined));
  });

  it('uses the tint, then the avatar colour, then the palette', () => {
    const key = seats[0]!.key;
    const avatars: Avatars = { [key]: { color: '#123456' } };
    expect(planAvatars(seats.slice(0, 1), avatars, { tint: () => '#abcdef' })[0]!.color).toBe(
      '#abcdef',
    );
    expect(planAvatars(seats.slice(0, 1), avatars)[0]!.color).toBe('#123456');
    const plain = planAvatars(seats.slice(0, 1), undefined)[0]!.color;
    expect(AVATAR_PALETTE).toContain(plain);
  });

  it('seeds the head height from avatars[key].seed when given', () => {
    const key = seats[0]!.key;
    const withSeed = planAvatars(seats.slice(0, 1), { [key]: { seed: 'other' } })[0]!;
    const plain = planAvatars(seats.slice(0, 1), undefined)[0]!;
    expect(withSeed.seed).toBe('other');
    expect(withSeed.headPosition.y).not.toBe(plain.headPosition.y);
  });

  it('gives at most 32 avatars a textured head', () => {
    const specs = planAvatars(seats, undefined, { headTexture: () => '/face.png' });
    expect(specs.filter((spec) => spec.textured)).toHaveLength(32);
    expect(specs[32]!.textured).toBe(false);
    expect(specs[0]!.imageUrl).toBe('/face.png');
  });
});

describe('taken seats and avatar options', () => {
  it('lists taken seats in layout order, without the seat the camera is in', () => {
    const [a, b, c] = seats;
    const occupancy = { revision: 1, taken: [c!.key, a!.key, b!.key] };
    expect(takenSeats(fixtureLayout, occupancy, a!.key).map((s) => s.key)).toEqual([
      b!.key,
      c!.key,
    ]);
    expect(takenSeats(fixtureLayout, undefined, null)).toEqual([]);
  });

  it('maps the avatar option to the scene', () => {
    expect(avatarOptionsOf('none')).toBeNull();
    expect(avatarOptionsOf(undefined)).toBe(EMPTY_AVATAR);
    expect(avatarOptionsOf('silhouette')).toBe(EMPTY_AVATAR);
    const custom = { tint: () => '#fff' };
    expect(avatarOptionsOf(custom)).toBe(custom);
  });
});
