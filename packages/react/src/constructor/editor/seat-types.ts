import type { HallConfig, SeatTypeConfig } from '@cinema-hall/core';
import { applyPatch, EditorRejection, notFound } from './config.js';

/**
 * Adds a seat type; a duplicate id is rejected.
 * @param config Current hall.
 * @param id New type id.
 * @param def Type definition.
 * @returns The candidate config.
 */
export function addSeatType(config: HallConfig, id: string, def: SeatTypeConfig): unknown {
  if (Object.hasOwn(config.seatTypes, id)) {
    throw new EditorRejection([
      { severity: 'error', code: 'schema.duplicateId', path: ['seatTypes', id], params: { id } },
    ]);
  }
  return { ...config, seatTypes: { ...config.seatTypes, [id]: def } };
}

/** Replaces one key of a record, keeping the key order. */
function renameKey<T>(
  record: Readonly<Record<string, T>>,
  from: string,
  to: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key === from ? to : key, value]),
  );
}

/**
 * Gives a seat type a new id and moves every reference with it: the sections and band defaults that
 * use it (`seatType`, and `priceTier` when it names the type) and its price tier. A taken id is
 * rejected; renaming to the same id changes nothing.
 * @param config Current hall.
 * @param id Current type id.
 * @param nextId New type id.
 * @returns The candidate config.
 */
export function renameSeatType(config: HallConfig, id: string, nextId: string): unknown {
  if (!Object.hasOwn(config.seatTypes, id)) throw notFound('seatType', id, ['seatTypes', id]);
  if (nextId === id) return config;
  const tiers = config.pricing?.tiers;
  if (Object.hasOwn(config.seatTypes, nextId) || (tiers && Object.hasOwn(tiers, nextId))) {
    throw new EditorRejection([
      {
        severity: 'error',
        code: 'schema.duplicateId',
        path: ['seatTypes', id],
        params: { id: nextId },
      },
    ]);
  }
  const swap = <T extends { seatType?: string; priceTier?: string }>(item: T): T => ({
    ...item,
    ...(item.seatType === id ? { seatType: nextId } : {}),
    ...(item.priceTier === id ? { priceTier: nextId } : {}),
  });
  const bands = config.layout.bands.map((band) => ({
    ...band,
    ...(band.defaults ? { defaults: swap(band.defaults) } : {}),
    sections: band.sections.map(swap),
  }));
  return {
    ...config,
    seatTypes: renameKey(config.seatTypes, id, nextId),
    layout: { ...config.layout, bands },
    ...(config.pricing && tiers
      ? { pricing: { ...config.pricing, tiers: renameKey(tiers, id, nextId) } }
      : {}),
  };
}

/**
 * Deep-merges a patch into a seat type.
 * @param config Current hall.
 * @param id Type id.
 * @param patch Partial type.
 * @returns The candidate config.
 */
export function patchSeatType(config: HallConfig, id: string, patch: unknown): unknown {
  if (!Object.hasOwn(config.seatTypes, id)) throw notFound('seatType', id, ['seatTypes', id]);
  return {
    ...config,
    seatTypes: { ...config.seatTypes, [id]: applyPatch(config.seatTypes[id], patch) },
  };
}

/**
 * Removing a type that is still in use leaves dangling references, which the structure check rejects.
 * @param config Current hall.
 * @param id Type id.
 * @returns The candidate config.
 */
export function removeSeatType(config: HallConfig, id: string): unknown {
  if (!Object.hasOwn(config.seatTypes, id)) throw notFound('seatType', id, ['seatTypes', id]);
  const rest = { ...config.seatTypes };
  delete rest[id];
  return { ...config, seatTypes: rest };
}
