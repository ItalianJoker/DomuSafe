import { describe, expect, it } from 'vitest';
import {
  createSavedFilterRequestSchema,
  inventoryFilterNodeSchema,
  inventoryFilterSearchRequestSchema,
  SAVED_FILTER_PIN_LIMIT,
} from '../src/inventory.js';

describe('inventory nested filters', () => {
  it('accepts nested AND/OR groups up to three levels', () => {
    const nested = {
      kind: 'group',
      op: 'and',
      children: [
        { kind: 'text', q: 'frullatore' },
        {
          kind: 'group',
          op: 'or',
          children: [
            { kind: 'tags', tags: ['cucina'], mode: 'and' },
            {
              kind: 'group',
              op: 'and',
              children: [
                { kind: 'types', types: ['inventory_items'] },
                { kind: 'tags', tags: ['elettrodomestico', 'cucina'], mode: 'and' },
              ],
            },
          ],
        },
      ],
    };
    expect(inventoryFilterNodeSchema.parse(nested)).toEqual(nested);
    expect(inventoryFilterSearchRequestSchema.parse({ filter: nested }).limit).toBe(20);
  });

  it('rejects a fourth nesting level and empty groups', () => {
    const tooDeep = {
      kind: 'group',
      op: 'and',
      children: [
        {
          kind: 'group',
          op: 'or',
          children: [
            {
              kind: 'group',
              op: 'and',
              children: [
                {
                  kind: 'group',
                  op: 'or',
                  children: [{ kind: 'text', q: 'troppo' }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(inventoryFilterNodeSchema.safeParse(tooDeep).success).toBe(false);
    expect(inventoryFilterNodeSchema.safeParse({ kind: 'group', op: 'and', children: [] }).success).toBe(
      false,
    );
  });

  it('caps saved filters at five pinned sidebar slots', () => {
    expect(SAVED_FILTER_PIN_LIMIT).toBe(5);
    expect(
      createSavedFilterRequestSchema.safeParse({
        name: 'Cucina',
        filter: { kind: 'text', q: 'padella' },
        pinnedPosition: 6,
      }).success,
    ).toBe(false);
    expect(
      createSavedFilterRequestSchema.parse({
        name: 'Cucina',
        filter: { kind: 'tags', tags: ['cucina'], mode: 'or' },
        pinnedPosition: 3,
      }).pinnedPosition,
    ).toBe(3);
  });
});
