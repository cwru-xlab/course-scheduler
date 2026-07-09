"use client";

import { useEffect, useState } from "react";
import { Button } from "@heroui/button";

import { EditorModalShell } from "../EditorModalShell";
import { joinCsv, splitCsv } from "@/lib/scheduling/csvFields";
import type { Room } from "@/lib/scheduling/types";

type RoomEditModalProps = {
  isOpen: boolean;
  room: Room;
  mode?: "create" | "edit";
  onClose: () => void;
  onSave: (room: Room) => void;
};

export function RoomEditModal({
  isOpen,
  room,
  mode = "edit",
  onClose,
  onSave,
}: RoomEditModalProps) {
  const [draft, setDraft] = useState(room);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft(room);
      setError(null);
    }
  }, [isOpen, room]);

  const handleSave = () => {
    if (!draft.id.trim()) {
      setError("Room ID is required.");
      return;
    }
    onSave({
      ...draft,
      id: draft.id.trim(),
      building: draft.building.trim(),
      room_number: draft.room_number.trim(),
    });
    onClose();
  };

  return (
    <EditorModalShell
      isOpen={isOpen}
      title={mode === "create" ? "Add room" : `Edit room — ${room.id}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="flat" onPress={onClose}>
            Cancel
          </Button>
          <Button color="primary" className="font-bold" onPress={handleSave}>
            {mode === "create" ? "Add" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">ID</span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={draft.id}
            onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Capacity</span>
          <input
            type="number"
            min={0}
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={draft.capacity}
            onChange={(e) =>
              setDraft((d) => ({ ...d, capacity: Number(e.target.value) || 0 }))
            }
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Building</span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={draft.building}
            onChange={(e) => setDraft((d) => ({ ...d, building: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">Room number</span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={draft.room_number}
            onChange={(e) => setDraft((d) => ({ ...d, room_number: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-slate-600">Features (comma-separated)</span>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={joinCsv(draft.features)}
            onChange={(e) => setDraft((d) => ({ ...d, features: splitCsv(e.target.value) }))}
          />
        </label>
      </div>
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </EditorModalShell>
  );
}
