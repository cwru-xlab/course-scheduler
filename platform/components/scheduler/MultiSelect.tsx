"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";

type MultiSelectProps = {
  value: string[];
  options: { key: string; label: string }[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  label?: string;
  /** Show a search field at the top of the dropdown to filter options. */
  showSearch?: boolean;
};

type SearchCtx = {
  search: string;
  setSearch: (v: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
};

const MultiSelectSearchContext = createContext<SearchCtx | null>(null);

/**
 * Search UI uses stable element identity (memoized `topContent`) so the listbox does not remount
 * the header on every keystroke. When the filtered row set changes, React Aria still refreshes the
 * virtualized list and can steal focus — parent `useLayoutEffect` restores the input when needed.
 */
function MultiSelectSearchField({ label }: { label?: string }) {
  const ctx = useContext(MultiSelectSearchContext);
  if (!ctx) return null;
  const { search, setSearch, searchInputRef } = ctx;
  return (
    <div
      className="sticky top-0 z-10 border-b border-default-200 bg-content1 px-2 py-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Input
        ref={searchInputRef}
        size="sm"
        placeholder="Search..."
        value={search}
        onValueChange={setSearch}
        aria-label={label ? `${label} search` : "Search options"}
      />
    </div>
  );
}

export const MultiSelect = ({
  value,
  options,
  onChange,
  placeholder = "Select...",
  label,
  showSearch = false,
}: MultiSelectProps) => {
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  /** True after user edits search; cleared after we run focus-restore for that list update. */
  const pendingSearchFocusRestore = useRef(false);

  const filteredOptions = useMemo(() => {
    if (!showSearch) return options;
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.key.toLowerCase().includes(q),
    );
  }, [options, search, showSearch]);

  const noMatches =
    showSearch &&
    search.trim() !== "" &&
    filteredOptions.length === 0;

  /** Drives focus-restore when the listbox collection changes (virtualized rows refresh). */
  const optionKeysSignature = useMemo(() => {
    if (noMatches) return "__no_match__";
    return filteredOptions.map((o) => o.key).join("\0");
  }, [filteredOptions, noMatches]);

  const setSearchTracked = useCallback((v: string) => {
    pendingSearchFocusRestore.current = true;
    setSearch(v);
  }, []);

  const searchContextValue = useMemo(
    () => ({ search, setSearch: setSearchTracked, searchInputRef }),
    [search, setSearchTracked],
  );

  useLayoutEffect(() => {
    if (!showSearch || !pendingSearchFocusRestore.current) return;
    const inputEl = searchInputRef.current;
    if (!inputEl) return;
    pendingSearchFocusRestore.current = false;

    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active === inputEl) return;
        if (active?.getAttribute("role") === "option") return;
        inputEl.focus({ preventScroll: true });
      });
    });
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
    };
  }, [optionKeysSignature, showSearch]);

  const topContent = useMemo(
    () => (showSearch ? <MultiSelectSearchField label={label} /> : null),
    [showSearch, label],
  );

  const listboxProps = useMemo(
    () => (showSearch && topContent ? { topContent } : undefined),
    [showSearch, topContent],
  );

  return (
    <MultiSelectSearchContext.Provider value={searchContextValue}>
      <Select
        size="sm"
        selectionMode="multiple"
        selectedKeys={new Set(value)}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys) as string[];
          onChange(selected);
        }}
        onClose={() => setSearch("")}
        className="w-full min-w-0 max-w-full"
        placeholder={placeholder}
        label={label}
        aria-label={label ? undefined : placeholder}
        classNames={{
          trigger: "min-h-unit-8 h-auto py-1",
        }}
        listboxProps={listboxProps}
      >
        {noMatches ? (
          <SelectItem key="__no_match__" isDisabled textValue="No matches">
            No matches
          </SelectItem>
        ) : (
          filteredOptions.map((option) => (
            <SelectItem key={option.key}>{option.label}</SelectItem>
          ))
        )}
      </Select>
    </MultiSelectSearchContext.Provider>
  );
};
