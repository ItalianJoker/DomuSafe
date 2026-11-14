import { describe, expect, it } from 'vitest';
import { createRoomRequestSchema, roomSchema, updateRoomRequestSchema } from '../src/inventory.js';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('room photo sets', () => {
  it('accepts day evening and lights-off data addresses or storage refs', () => {
    const created = createRoomRequestSchema.safeParse({
      name: 'Cucina',
      photoDayDataUrl: TINY_PNG,
      photoEveningStorageRef: 'family/room/evening',
      photoLightsOffDataUrl: null,
    });
    expect(created.success).toBe(true);

    const updated = updateRoomRequestSchema.safeParse({
      photoLightsOffDataUrl: TINY_PNG,
      photoEveningStorageRef: null,
    });
    expect(updated.success).toBe(true);

    expect(
      createRoomRequestSchema.safeParse({
        name: 'Cucina',
        photoDayDataUrl: 'data:image/svg+xml;base64,AAAA',
      }).success,
    ).toBe(false);

    const room = roomSchema.safeParse({
      id: '01900000-0000-7000-8000-000000000001',
      familyId: '01900000-0000-7000-8000-000000000002',
      houseId: '01900000-0000-7000-8000-000000000003',
      name: 'Cucina',
      kind: 'kitchen',
      floor: null,
      sortOrder: 0,
      notes: null,
      photoDayDataUrl: TINY_PNG,
      photoEveningDataUrl: null,
      photoLightsOffDataUrl: null,
      photoDayStorageRef: null,
      photoEveningStorageRef: 'family/room/evening',
      photoLightsOffStorageRef: null,
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(room.success).toBe(true);
  });
});
