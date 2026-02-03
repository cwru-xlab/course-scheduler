"use client";

import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";

import { EditableCell } from "../EditableCell";
import { EditableArrayCell } from "../EditableArrayCell";

import type { Room } from "@/lib/scheduling/types";

type RoomsEditorProps = {
  rooms: Room[];
  onUpdate: (rooms: Room[]) => void;
};

const createEmptyRoom = (): Room => ({
  id: `ROOM-NEW-${Date.now()}`,
  building: "",
  capacity: 30,
  features: [],
});

export const RoomsEditor = ({ rooms, onUpdate }: RoomsEditorProps) => {
  const updateRoom = (index: number, field: keyof Room, value: unknown) => {
    const newRooms = [...rooms];
    newRooms[index] = { ...newRooms[index], [field]: value };
    onUpdate(newRooms);
  };

  const addRoom = () => {
    onUpdate([...rooms, createEmptyRoom()]);
  };

  const deleteRoom = (index: number) => {
    onUpdate(rooms.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <h3 className="text-lg font-semibold">Rooms ({rooms.length})</h3>
        <Button size="sm" color="primary" variant="flat" onPress={addRoom}>
          + Add Room
        </Button>
      </CardHeader>
      <CardBody className="overflow-x-auto text-sm">
        <table className="min-w-full">
          <thead className="text-left text-default-500">
            <tr>
              <th className="pb-2 pr-3">ID</th>
              <th className="pb-2 pr-3">Building</th>
              <th className="pb-2 pr-3">Capacity</th>
              <th className="pb-2 pr-3">Features</th>
              <th className="pb-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room, idx) => (
              <tr key={`${room.id}-${idx}`} className="border-t border-default-200">
                <td className="py-2 pr-3">
                  <EditableCell value={room.id} onChange={(v) => updateRoom(idx, "id", v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell value={room.building} onChange={(v) => updateRoom(idx, "building", v)} placeholder="Building" />
                </td>
                <td className="py-2 pr-3">
                  <EditableCell type="number" value={room.capacity} onChange={(v) => updateRoom(idx, "capacity", v)} />
                </td>
                <td className="py-2 pr-3">
                  <EditableArrayCell value={room.features} onChange={(v) => updateRoom(idx, "features", v)} placeholder="projector, etc" />
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
      </CardBody>
    </Card>
  );
};
