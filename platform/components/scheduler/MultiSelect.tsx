"use client";

import { useMemo, useState } from "react";
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

export const MultiSelect = ({
  value,
  options,
  onChange,
  placeholder = "Select...",
  label,
  showSearch = false,
}: MultiSelectProps) => {
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    if (!showSearch) return options;
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.key.toLowerCase().includes(q),
    );
  }, [options, search, showSearch]);

  const listboxProps = showSearch
    ? {
        topContent: (
          <div
            className="sticky top-0 z-10 border-b border-default-200 bg-content1 px-2 py-2"
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Input
              size="sm"
              placeholder="Search..."
              value={search}
              onValueChange={setSearch}
              aria-label={label ? `${label} search` : "Search options"}
            />
          </div>
        ),
      }
    : undefined;

  const noMatches =
    showSearch &&
    search.trim() !== "" &&
    filteredOptions.length === 0;

  return (
    <Select
      size="sm"
      selectionMode="multiple"
      selectedKeys={new Set(value)}
      onSelectionChange={(keys) => {
        const selected = Array.from(keys) as string[];
        onChange(selected);
      }}
      onClose={() => setSearch("")}
      className="min-w-[150px]"
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
  );
};
