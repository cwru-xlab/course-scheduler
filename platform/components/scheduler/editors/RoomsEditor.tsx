"use client";

import { useMemo, useState } from "react";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Input } from "@heroui/input";

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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Rooms ({rooms.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addRoom}>
          + Add Room
        </Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <Input
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search rooms..."
          size="sm"
          className="mb-3 max-w-md"
          isClearable
        />
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">ID</th>
              <th className="pb-2 pr-3">Building</th>
              <th className="pb-2 pr-3">Room #</th>
              <th className="pb-2 pr-3">Capacity</th>
              <th className="pb-2 pr-3">Features</th>
              <th className="pb-2 pr-3">View Notes</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredRooms.map(({ room, index: idx }) => (
              <tr
                key={`${room.id}-${idx}`}
                id={`note-rooms-${encodeURIComponent(String(room.id))}`}
                className="border-t border-default-200"
              >
                <td className="py-2 pr-3">
                  <EditableCell value={room.id} onChange={(v) => updateRoom(idx, "id", v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={room.building} onChange={(v) => updateRoom(idx, "building", v)} placeholder="Building" />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={room.room_number} onChange={(v) => updateRoom(idx, "room_number", v)} placeholder="101" />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell type="number" value={room.capacity} onChange={(v) => updateRoom(idx, "capacity", v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableArrayCell value={room.features} onChange={(v) => updateRoom(idx, "features", v)} placeholder="projector, etc" />
                </td>
                <td className="py-2 pr-3">
                  <RowNotesButton
                    scope="rooms"
                    rowId={String(room.id)}
                    title={`Room Notes - ${room.building} ${room.room_number}`.trim()}
                  />
                </td>
                <td className="py-2 pr-3">
                  <Button size="sm" color="danger" variant="light" isIconOnly onPress={() => deleteRoom(idx)}>
                    ✕
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rooms.length === 0 && (
          <div className="py-4 text-center text-default-400">No rooms. Click "Add Room" to create one.</div>
        )}
        {rooms.length > 0 && filteredRooms.length === 0 && (
          <div className="py-4 text-center text-default-400">No rooms match your search.</div>
        )}
      </CardBody>
    </Card>
  );
};
