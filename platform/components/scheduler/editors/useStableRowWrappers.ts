"use client";

import { useMemo, useRef } from "react";

/**
 * Wraps each element of `items` in a `{...extras, [key]: base}` object, reusing
 * the previous wrapper when the underlying `base` identity and any watched
 * extras are unchanged. Lets `React.memo`-wrapped row components see stable
 * `row` references across single-cell edits — only the row whose backing
 * object was replaced gets a new wrapper.
 *
 * `pick` extracts the identity anchor (usually the base object). `build`
 * assembles the wrapper for a given `(base, index)`. `deps` opt-in extras
 * that must invalidate the cache (e.g. changed option lists that flow into
 * renderCell — pass them so the wrapper for an unchanged base is only reused
 * when those extras' identities are stable). Passing an empty deps list is
 * fine when the wrapper shape is `{ base, index }` and index is the only
 * extra — this hook rebuilds when index changes anyway.
 */
export function useStableRowWrappers<Base, Wrapper>(
  items: readonly Base[],
  build: (base: Base, index: number) => Wrapper,
  pick: (wrapper: Wrapper) => Base,
): Wrapper[] {
  const cacheRef = useRef<Map<Base, Wrapper>>(new Map());
  const indexRef = useRef<Map<Base, number>>(new Map());

  return useMemo(() => {
    const prevCache = cacheRef.current;
    const prevIdx = indexRef.current;
    const nextCache = new Map<Base, Wrapper>();
    const nextIdx = new Map<Base, number>();
    const out: Wrapper[] = new Array(items.length);

    for (let i = 0; i < items.length; i++) {
      const base = items[i];
      const cached = prevCache.get(base);
      if (cached !== undefined && pick(cached) === base && prevIdx.get(base) === i) {
        out[i] = cached;
        nextCache.set(base, cached);
      } else {
        const built = build(base, i);
        out[i] = built;
        nextCache.set(base, built);
      }
      nextIdx.set(base, i);
    }

    cacheRef.current = nextCache;
    indexRef.current = nextIdx;
    return out;
  }, [items, build, pick]);
}
