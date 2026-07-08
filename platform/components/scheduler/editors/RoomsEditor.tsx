"use client";

import { useMemo, useState } from "react";

import { EditorColumnFilters } from "./EditorColumnFilters";
import { EditorConfigurableTable } from "./EditorConfigurableTable";
import { EditorRowActions } from "./EditorRowActions";
import { EditorTableShell } from "./EditorTableShell";
import {
  applyEditorColumnFilters,
  type EditorColumnFilterDef,
  type EditorFiltersState,
} from "./editorFilters";
import { sortDefsFromFilterDefs } from "./editorSort";
import { ROOM_COLUMN_SPECS } from "./editorColumnSpecs";
import { useEditorActions } from "./EditorActionProvider";
import { editorRowKey } from "./editorRowHighlight";
import { RoomEditModal } from "./modals/RoomEditModal";

import { EditableCell } from "../EditableCell";
import { EditableArrayCell } from "../EditableArrayCell";
import { RowNotesButton } from "../RowNotesButton";

import type { Room } from "@/lib/scheduling/types";
import { insertAtSortedIdPosition } from "@/lib/scheduling/insertAtSortedIdPosition";
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
  const [columnFilters, setColumnFilters] = useState<EditorFiltersState>({});
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addDraft, setAddDraft] = useState<Room | null>(null);
  const { confirmRowAdded, getRowHighlightClass } = useEditorActions();

  const updateRoom = (index: number, field: keyof Room, value: unknown) => {
    const newRooms = [...rooms];
    newRooms[index] = { ...newRooms[index], [field]: value };
    onUpdate(newRooms);
  };

  const addRoom = () => {
    setAddDraft(createEmptyRoom(rooms));
  };

  const deleteRoom = (index: number) => {
    onUpdate(rooms.filter((_, i) => i !== index));
  };

  const roomFilterDefs = useMemo(
    (): EditorColumnFilterDef<RoomRow>[] => [
      {
        columnId: "id",
        label: "ID",
        control: { kind: "multiSearch", textMatch: "startsWith" },
        getValue: ({ room }) => room.id,
      },
      {
        columnId: "building",
        label: "Building",
        control: { kind: "multiSelect" },
        getValue: ({ room }) => room.building,
      },
      {
        columnId: "room_number",
        label: "Room #",
        control: { kind: "multiSearch", textMatch: "startsWith" },
        getValue: ({ room }) => room.room_number,
      },
      {
        columnId: "capacity",
        label: "Capacity",
        control: { kind: "numberCompare" },
        getValue: ({ room }) => room.capacity,
      },
      {
        columnId: "features",
        label: "Features",
        control: { kind: "multiSearch", textMatch: "startsWith" },
        arrayValue: true,
        getValue: ({ room }) => room.features,
      },
    ],
    [],
  );

  const roomSortDefs = useMemo(() => sortDefsFromFilterDefs(roomFilterDefs), [roomFilterDefs]);

  const roomRows = useMemo(
    (): RoomRow[] => rooms.map((room, index) => ({ room, index })),
    [rooms],
  );

  const filteredRooms = useMemo((): RoomRow[] => {
    const query = searchQuery.trim().toLowerCase();
    let rows = roomRows;
    if (query) {
      rows = rows.filter(({ room }) => {
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
    }
    return applyEditorColumnFilters(rows, columnFilters, roomFilterDefs);
  }, [roomRows, searchQuery, columnFilters, roomFilterDefs]);

  const renderCell = (columnId: string, { room, index: idx }: RoomRow) => {
    switch (columnId) {
      case "id":
        return (
          <span
            className="block truncate px-2 py-1 text-slate-600 font-mono text-xs select-text"
            title={String(room.id)}
          >
            {room.id}
          </span>
        );
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
      title={`Rooms (${filteredRooms.length})`}
      addLabel="+ Add Room"
      onAdd={addRoom}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search rooms..."
      filterBar={
        <EditorColumnFilters
          defs={roomFilterDefs}
          rows={roomRows}
          filters={columnFilters}
          onChange={setColumnFilters}
        />
      }
      emptyMessage='No rooms. Click "Add Room" to create one.'
      noMatchMessage="No rooms match your search or filters."
      isEmpty={rooms.length === 0}
      hasNoMatches={rooms.length > 0 && filteredRooms.length === 0}
    >
      <EditorConfigurableTable
        editorKey="rooms"
        columnSpecs={ROOM_COLUMN_SPECS}
        rows={filteredRooms}
        sortDefs={roomSortDefs}
        getRowKey={({ room, index }) => `${room.id}-${index}`}
        getRowId={({ room }) => `note-rooms-${encodeURIComponent(String(room.id))}`}
        getRowClassName={({ room }) =>
          getRowHighlightClass(
            "border-t border-default-200",
            "rooms",
            String(room.id),
          )
        }
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
      {addDraft ? (
        <RoomEditModal
          isOpen
          mode="create"
          room={addDraft}
          onClose={() => setAddDraft(null)}
          onSave={(created) => {
            onUpdate(insertAtSortedIdPosition(rooms, created));
            setAddDraft(null);
            confirmRowAdded({
              rowKey: editorRowKey("rooms", String(created.id)),
              message: `Successfully added room ${created.building} ${created.room_number}.`,
            });
          }}
        />
      ) : null}
    </EditorTableShell>
  );
};
