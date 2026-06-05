"use client";

import { useMemo, useState } from "react";

import { EditorConfigurableTable } from "./EditorConfigurableTable";
import { EditorRowActions } from "./EditorRowActions";
import { EditorTableShell } from "./EditorTableShell";
import { ROOM_COLUMN_SPECS } from "./editorColumnSpecs";
import { RoomEditModal } from "./modals/RoomEditModal";

import { EditableCell } from "../EditableCell";
import { EditableArrayCell } from "../EditableArrayCell";
import { RowNotesButton } from "../RowNotesButton";

import type { Room } from "@/lib/scheduling/types";
import { nextIntegerId } from "@/lib/scheduling/nextId";

type RoomRow = { room: Room; index: number };

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
  const [editIndex, setEditIndex] = useState<number | null>(null);

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

  const filteredRooms = useMemo((): RoomRow[] => {
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

  const renderCell = (columnId: string, { room, index: idx }: RoomRow) => {
    switch (columnId) {
      case "id":
        return <EditableCell value={room.id} onChange={(v) => updateRoom(idx, "id", v)} />;
      case "building":
        return (
          <EditableCell
            value={room.building}
            onChange={(v) => updateRoom(idx, "building", v)}
            placeholder="Building"
          />
        );
      case "room_number":
        return (
          <EditableCell
            value={room.room_number}
            onChange={(v) => updateRoom(idx, "room_number", v)}
            placeholder="101"
          />
        );
      case "capacity":
        return (
          <EditableCell type="number" value={room.capacity} onChange={(v) => updateRoom(idx, "capacity", v)} />
        );
      case "features":
        return (
          <EditableArrayCell
            value={room.features}
            onChange={(v) => updateRoom(idx, "features", v)}
            placeholder="projector, etc"
          />
        );
      default:
        return null;
    }
  };

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
      <EditorConfigurableTable
        editorKey="rooms"
        columnSpecs={ROOM_COLUMN_SPECS}
        rows={filteredRooms}
        getRowKey={({ room, index }) => `${room.id}-${index}`}
        getRowId={({ room }) => `note-rooms-${encodeURIComponent(String(room.id))}`}
        renderCell={renderCell}
        renderActions={({ room, index: idx }) => (
          <EditorRowActions
            notes={
              <RowNotesButton
                scope="rooms"
                rowId={String(room.id)}
                title={`Room Notes - ${room.building} ${room.room_number}`.trim()}
              />
            }
            rowLabel={`room ${room.building} ${room.room_number} (${room.id})`}
            onEdit={() => setEditIndex(idx)}
            onDelete={() => deleteRoom(idx)}
          />
        )}
      />
      {editIndex !== null && rooms[editIndex] ? (
        <RoomEditModal
          isOpen
          room={rooms[editIndex]}
          onClose={() => setEditIndex(null)}
          onSave={(updated) => {
            const next = [...rooms];
            next[editIndex] = updated;
            onUpdate(next);
          }}
        />
      ) : null}
    </EditorTableShell>
  );
};
