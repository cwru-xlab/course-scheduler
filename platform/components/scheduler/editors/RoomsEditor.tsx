"use client";

import { useCallback, useMemo, useState } from "react";

import { EditorColumnFilters } from "./EditorColumnFilters";
import { EditorColumnPicker } from "./EditorColumnPicker";
import { EditorConfigurableTable } from "./EditorConfigurableTable";
import { useEditorColumnVisibility } from "./useEditorColumnVisibility";
import { useStableRowWrappers } from "./useStableRowWrappers";
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

import { ReadOnlyIdCell } from "./ReadOnlyIdCell";
import { EditableCell } from "../EditableCell";
import { CompactChipSelect } from "../CompactChipSelect";
import { RowNotesButton } from "../RowNotesButton";

import type { Room, Section } from "@/lib/scheduling/types";
import { insertAtSortedIdPosition } from "@/lib/scheduling/insertAtSortedIdPosition";
import { nextIntegerId } from "@/lib/scheduling/nextId";
import { useStableDataRef } from "./useStableDataRef";

type RoomRow = { room: Room; index: number };

type RoomsEditorProps = {
  rooms: Room[];
  sections: Section[];
  onUpdate: (rooms: Room[]) => void;
};

const createEmptyRoom = (existing: Room[]): Room => ({
  id: nextIntegerId(existing.map((r) => r.id)),
  building: "",
  room_number: "",
  capacity: 30,
  features: [],
});

export const RoomsEditor = ({ rooms, sections, onUpdate }: RoomsEditorProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [columnFilters, setColumnFilters] = useState<EditorFiltersState>({});
  const columnVisibility = useEditorColumnVisibility("rooms", ROOM_COLUMN_SPECS);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [addDraft, setAddDraft] = useState<Room | null>(null);
  const { confirmRowAdded, getRowHighlightClass } = useEditorActions();
  const roomsRef = useStableDataRef(rooms);

  const updateRoom = (index: number, field: keyof Room, value: unknown) => {
    const current = roomsRef.current;
    const newRooms = [...current];
    newRooms[index] = { ...newRooms[index], [field]: value };
    onUpdate(newRooms);
  };

  const addRoom = () => {
    setAddDraft(createEmptyRoom(roomsRef.current));
  };

  const deleteRoom = (index: number) => {
    onUpdate(roomsRef.current.filter((_, i) => i !== index));
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

  const featureSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const room of rooms) {
      for (const f of room.features) set.add(f);
    }
    for (const s of sections) {
      for (const r of s.room_requirements) set.add(r);
    }
    return Array.from(set).sort();
  }, [rooms, sections]);

  const buildRoomRow = useCallback(
    (room: Room, index: number): RoomRow => ({ room, index }),
    [],
  );
  const pickRoomBase = useCallback((row: RoomRow) => row.room, []);
  const roomRows = useStableRowWrappers(rooms, buildRoomRow, pickRoomBase);

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
        return <ReadOnlyIdCell value={room.id} />;
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
          <CompactChipSelect
            value={room.features}
            onChange={(v) => updateRoom(idx, "features", v)}
            suggestions={featureSuggestions}
            placeholder="features"
            ariaLabel="Features"
          />
        );
      default:
        return null;
    }
  };

  return (
    <EditorTableShell
      title={`Rooms (${filteredRooms.length})`}
      addLabel="Add Room"
      onAdd={addRoom}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchPlaceholder="Search rooms..."
      filterBar={
        <div className="flex flex-wrap items-center gap-2">
          <EditorColumnFilters
            defs={roomFilterDefs}
            rows={roomRows}
            filters={columnFilters}
            onChange={setColumnFilters}
          />
          <EditorColumnPicker
            specs={columnVisibility.specs}
            visibleIds={columnVisibility.visibleIds}
            onToggle={columnVisibility.toggleColumn}
            onShowAll={columnVisibility.showAllColumns}
            onHideAll={columnVisibility.hideAllColumns}
          />
        </div>
      }
      emptyMessage='No rooms. Click "Add Room" to create one.'
      noMatchMessage="No rooms match your search or filters."
      isEmpty={rooms.length === 0}
      hasNoMatches={rooms.length > 0 && filteredRooms.length === 0}
    >
      <EditorConfigurableTable
        editorKey="rooms"
        columnSpecs={ROOM_COLUMN_SPECS}
        visibility={columnVisibility}
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
          featureSuggestions={featureSuggestions}
          onClose={() => setEditIndex(null)}
          onSave={(updated) => {
            const current = roomsRef.current;
            const next = [...current];
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
          featureSuggestions={featureSuggestions}
          onClose={() => setAddDraft(null)}
          onSave={(created) => {
            onUpdate(insertAtSortedIdPosition(roomsRef.current, created));
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
