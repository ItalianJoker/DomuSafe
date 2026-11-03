/** Object type without `undefined` values, as required by `exactOptionalPropertyTypes` for partial updates. */
export type DefinedOnly<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/**
 * Drops keys whose value is `undefined` (absent fields of a `PATCH` body); `null` is kept because it
 * clears a column.
 *
 * @param value - Parsed request body.
 * @returns A shallow copy without `undefined` values.
 */
export function definedOnly<T extends object>(value: T): DefinedOnly<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as DefinedOnly<T>;
}
