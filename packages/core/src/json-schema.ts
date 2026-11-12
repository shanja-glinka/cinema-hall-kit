import { z } from 'zod';
import { HallConfigSchema } from './schema.js';

/** JSON Schema of a hall config (structure and limits only; geometry needs `validateHall`). */
export const hallConfigJsonSchema: Record<string, unknown> = {
  ...z.toJSONSchema(HallConfigSchema),
  $id: 'https://cinema-hall.dev/schema/hall-config-v1.json',
  title: 'Cinema hall config (version 1)',
};
