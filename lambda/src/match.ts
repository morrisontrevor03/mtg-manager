/**
 * Route matching for the Lambda adapter.
 *
 * Deliberately free of imports so it can be unit-tested without loading Prisma
 * or any route module. API Gateway does supply a `routeKey` and
 * `pathParameters`, but matching here keeps one code path that also works for a
 * Function URL, a local harness, and the tests.
 */

export interface RouteMatch<T> {
  key: string;
  value: T;
  params: Record<string, string>;
}

/**
 * Resolve `method` + `path` against a map of route keys.
 *
 * Literal routes take precedence over ones containing `{param}` segments, so
 * `POST /api/decks/build` is never swallowed by a parameterised sibling.
 */
export function matchRoute<T>(
  table: Record<string, T>,
  method: string,
  path: string,
): RouteMatch<T> | null {
  // Trailing slashes are equivalent; `/` itself is left alone.
  const normalised = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;

  const exactKey = `${method} ${normalised}`;
  if (Object.prototype.hasOwnProperty.call(table, exactKey)) {
    return { key: exactKey, value: table[exactKey], params: {} };
  }

  const segments = normalised.split("/");

  for (const key of Object.keys(table)) {
    const spaceAt = key.indexOf(" ");
    const keyMethod = key.slice(0, spaceAt);
    const keyPath = key.slice(spaceAt + 1);
    if (keyMethod !== method || !keyPath.includes("{")) continue;

    const keySegments = keyPath.split("/");
    if (keySegments.length !== segments.length) continue;

    const params: Record<string, string> = {};
    const matched = keySegments.every((seg, i) => {
      if (seg.startsWith("{") && seg.endsWith("}")) {
        if (!segments[i]) return false;
        params[seg.slice(1, -1)] = decodeURIComponent(segments[i]);
        return true;
      }
      return seg === segments[i];
    });

    if (matched) return { key, value: table[key], params };
  }

  return null;
}
