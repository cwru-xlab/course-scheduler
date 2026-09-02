"use client";

import { Button } from "@heroui/button";

import { EditorModalShell } from "@/components/scheduler/editors/EditorModalShell";

type HalfTermSelectionModalProps = {
  isOpen: boolean;
  sectionLabel: string;
  onChoose: (half: "first_half" | "second_half") => void;
  onClose: () => void;
};

export function HalfTermSelectionModal({
  isOpen,
  sectionLabel,
  onChoose,
  onClose,
}: HalfTermSelectionModalProps) {
  return (
    <EditorModalShell
      isOpen={isOpen}
      title="Assign half-semester term"
      onClose={onClose}
      footer={
        <Button variant="flat" onPress={onClose}>
          Cancel
        </Button>
      }
    >
      <p className="text-sm text-slate-600">
        <span className="font-semibold text-slate-800">{sectionLabel}</span> is marked as half
        (any). Choose which half of the semester it meets in:
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button color="primary" className="font-bold" onPress={() => onChoose("first_half")}>
          1st half
        </Button>
        <Button color="primary" variant="flat" className="font-bold" onPress={() => onChoose("second_half")}>
          2nd half
        </Button>
      </div>
    </EditorModalShell>
  );
}
