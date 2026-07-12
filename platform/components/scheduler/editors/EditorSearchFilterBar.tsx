"use client";

import type { ReactNode } from "react";
import { Input } from "@heroui/input";

type EditorSearchFilterBarProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchHint?: string;
  filterBar?: ReactNode;
  addButton?: ReactNode;
};

export function EditorSearchFilterBar({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  searchHint,
  filterBar,
  addButton,
}: EditorSearchFilterBarProps) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={searchQuery}
          onValueChange={onSearchChange}
          placeholder={searchPlaceholder}
          size="sm"
          isClearable
          className="w-full max-w-md"
        />
        {filterBar}
        {addButton ? <div className="ml-auto shrink-0">{addButton}</div> : null}
      </div>
      {searchHint ? (
        <p className="mt-1.5 text-xs text-default-400">{searchHint}</p>
      ) : null}
    </div>
  );
}
