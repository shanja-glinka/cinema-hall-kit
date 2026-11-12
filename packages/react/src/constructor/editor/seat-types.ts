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
