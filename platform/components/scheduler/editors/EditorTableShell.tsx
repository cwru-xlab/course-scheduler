"use client";

import type { ReactNode } from "react";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { EditorSearchFilterBar } from "./EditorSearchFilterBar";

/** Table header cell: fits within table-fixed column width. */
export const editorTh =
  "pb-2 pr-1.5 text-xs font-semibold uppercase tracking-wide text-default-500 truncate";

/** Table body cell: allows flex children to shrink inside fixed columns. */
export const editorTd = "py-2 pr-1.5 align-top min-w-0 overflow-hidden";

type EditorTableShellProps = {
  title: string;
  addLabel: string;
  onAdd: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  /** Optional helper text shown below the search field. */
  searchHint?: string;
  /** Column filter UI rendered to the right of the search field. */
  filterBar?: ReactNode;
  emptyMessage: string;
  noMatchMessage: string;
  isEmpty: boolean;
  hasNoMatches: boolean;
  children: ReactNode;
};

export function EditorTableShell({
  title,
  addLabel,
  onAdd,
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  searchHint,
  filterBar,
  emptyMessage,
  noMatchMessage,
  isEmpty,
  hasNoMatches,
  children,
}: EditorTableShellProps) {
  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <h3 className="text-lg font-semibold shrink-0">{title}</h3>
        <Button size="sm" color="primary" variant="flat" onPress={onAdd}>
          {addLabel}
        </Button>
      </CardHeader>
      <CardBody className="w-full min-w-0 overflow-hidden text-sm">
        <EditorSearchFilterBar
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
          searchHint={searchHint}
          filterBar={filterBar}
        />
        <div className="w-full min-w-0">{children}</div>
        {isEmpty && (
          <div className="py-4 text-center text-default-400">{emptyMessage}</div>
        )}
        {hasNoMatches && (
          <div className="py-4 text-center text-default-400">{noMatchMessage}</div>
        )}
      </CardBody>
    </Card>
  );
}
