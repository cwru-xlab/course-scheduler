"use client";

import { useRef } from "react";

/**
 * Returns a ref whose `.current` always mirrors the latest `items` value.
 *
 * Use this inside editors so that mutation handlers (update, delete, add,
 * modal-save, etc.) always derive the next array from the authoritative
 * latest snapshot, never from a stale render-scope closure.
 *
 * Without this, two rapid mutations before a React re-render will each
 * spread a stale snapshot, causing the second to silently overwrite the first.
 */
export function useStableDataRef<T>(items: T[]) {
  const ref = useRef(items);
  ref.current = items;
  return ref;
}
