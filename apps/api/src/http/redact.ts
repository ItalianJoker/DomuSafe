/**
 * Removes printed-code tokens from a request path before it is written to the log.
 *
 * Preconditions: `url` is a path, with an optional query string.
 * Postconditions: a public house or rescue token is replaced; every other path is unchanged.
 * Data contract: the result never contains the token that was in the path.
 *
 * @param url - Raw request path.
 * @returns The same path with each public token replaced.
 */
export function redactRequestUrl(url: string): string {
  return url.replace(/\/api\/v1\/public\/(?:house-pages|rescue-sheets)\/[^/?#]+/u, (match) =>
    match.replace(/\/[^/]+$/u, '/redacted'),
  );
}
