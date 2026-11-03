import { customType, timestamp } from 'drizzle-orm/pg-core';

/** `bytea` column mapped to `Uint8Array` with its own `ArrayBuffer` (Web Crypto compatible). */
export const bytea = customType<{ data: Uint8Array<ArrayBuffer>; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => {
    const out = new Uint8Array(value.length);
    out.set(value);
    return out;
  },
});

/** Case-insensitive text (`citext`) mapped to `string`. */
export const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

/**
 * `timestamptz` column returned as `Date`.
 *
 * @param name - SQL column name.
 * @returns Drizzle column builder.
 */
export function instant(name: string) {
  return timestamp(name, { withTimezone: true, mode: 'date' });
}
