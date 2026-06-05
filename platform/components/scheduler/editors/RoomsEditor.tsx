"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/button";

import { EditorTableShell, editorTd, editorTh } from "./EditorTableShell";

import { EditableCell } from "../EditableCell";
import { EditableArrayCell } from "../EditableArrayCell";
import { RowNotesButton } from "../RowNotesButton";

import type { Room } from "@/lib/scheduling/types";
import { nextIntegerId } from "@/lib/scheduling/nextId";

type RoomsEditorProps = {
  rooms: Room[];
  onUpdate: (rooms: Room[]) => void;
};

const createEmptyRoom = (existing: Room[]): Room => ({
  id: nextIntegerId(existing.map((r) => r.id)),
  building: "",
  room_number: "",
  capacity: 30,
  features: [],
});

export const RoomsEditor = ({ rooms, onUpdate }: RoomsEditorProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const updateRoom = (index: number, field: keyof Room, value: unknown) => {
    const newRooms = [...rooms];
    newRooms[index] = { ...newRooms[index], [field]: value };
    onUpdate(newRooms);
  };

  const addRoom = () => {
    onUpdate([...rooms, createEmptyRoom(rooms)]);
  };

  const deleteRoom = (index: number) => {
    onUpdate(rooms.filter((_, i) => i !== index));
  };

  const filteredRooms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rooms
      .map((room, index) => ({ room, index }))
      .filter(({ room }) => {
        if (!query) return true;
        const searchable = [
          room.id,
          room.building,
          room.room_number,
          room.capacity,
          ...room.features,
        ]
          .join(" ")
          .toLowerCase();
        return searchable.includes(query);
      });
  }, [rooms, searchQuery]);

  return (
    <EditorTableShell
      title={`Rooms (${rooms.length})`}
      addLabel="+ Add Room"
      onAdd={addRoom}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search rooms..."
      emptyMessage='No rooms. Click "Add Room" to create one.'
      noMatchMessage="No rooms match your search."
      isEmpty={rooms.length === 0}
      hasNoMatches={rooms.length > 0 && filteredRooms.length === 0}
    >
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            <th className={`${editorTh} w-[8%]`}>ID</th>
            <th className={`${editorTh} w-[18%]`}>Building</th>
            <th className={`${editorTh} w-[12%]`}>Room #</th>
            <th className={`${editorTh} w-[10%]`}>Capacity</th>
            <th className={`${editorTh} w-[38%]`}>Features</th>
            <th className={`${editorTh} w-[10%]`}>Notes</th>
            <th className={`${editorTh} w-[4%]`} aria-label="Actions" />
          </tr>
        </thead>
          <tbody>
            {filteredRooms.map(({ room, index: idx }) => (
              <tr
                key={`${room.id}-${idx}`}
                id={`note-rooms-${encodeURIComponent(String(room.id))}`}
                className="border-t border-default-200"
              >
                <td className={editorTd}>
                  <EditableCell value={room.id} onChange={(v) => updateRoom(idx, "id", v)} />
                </td>
                <td className={editorTd}>
                  <EditableCell value={room.building} onChange={(v) => updateRoom(idx, "building", v)} placeholder="Building" />
                </td>
                <td className={editorTd}>
                  <EditableCell value={room.room_number} onChange={(v) => updateRoom(idx, "room_number", v)} placeholder="101" />
                </td>
                <td className={editorTd}>
                  <EditableCell type="number" value={room.capacity} onChange={(v) => updateRoom(idx, "capacity", v)} />
                </td>
                <td className={editorTd}>
                  <EditableArrayCell value={room.features} onChange={(v) => updateRoom(idx, "features", v)} placeholder="projector, etc" />
                </td>
                <td className={editorTd}>
                  <RowNotesButton
                    scope="rooms"
                    rowId={String(room.id)}
                    title={`Room Notes - ${room.building} ${room.room_number}`.trim()}
                  />
                </td>
                <td className={editorTd}>
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteRoom(idx)}>
                    ✕
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
      </table>
    </EditorTableShell>
  );
};
