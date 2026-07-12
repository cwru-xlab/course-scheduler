"use client";

import type { ReactNode } from "react";
import { Button } from "@heroui/button";
import { Pencil, Trash2 } from "lucide-react";

import { useEditorActions } from "./EditorActionProvider";

type EditorRowActionsProps = {
  rowLabel: string;
  onEdit?: () => void;
  onDelete: () => void;
  notes?: ReactNode;
};

export function EditorRowActions({ rowLabel, onEdit, onDelete, notes }: EditorRowActionsProps) {
  const { requestDelete, showSuccess } = useEditorActions();

  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      {notes}
      {onEdit ? (
        <Button
          size="sm"
          variant="light"
          isIconOnly
          aria-label={`Edit ${rowLabel}`}
          onPress={onEdit}
        >
          <Pencil className="size-4 text-slate-600" />
        </Button>
      ) : null}
      <Button
        size="sm"
        color="danger"
        variant="light"
        isIconOnly
        aria-label={`Delete ${rowLabel}`}
        onPress={() =>
          requestDelete({
            rowLabel,
            onConfirm: () => {
              onDelete();
              showSuccess(`Successfully deleted ${rowLabel}.`);
            },
          })
        }
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
