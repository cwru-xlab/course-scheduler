"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@heroui/input";

type EditableArrayCellProps = {
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
  placeholder?: string;
};

export const EditableArrayCell = ({
  value,
  onChange,
  className = "",
  placeholder = "comma-separated",
}: EditableArrayCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value.join(", "));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value.join(", "));
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    setIsEditing(false);
    const newValue = editValue
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (JSON.stringify(newValue) !== JSON.stringify(value)) {
      onChange(newValue);
    }
  }, [editValue, onChange, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSave();
      } else if (e.key === "Escape") {
        setEditValue(value.join(", "));
        setIsEditing(false);
      }
    },
    [handleSave, value]
  );

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        size="sm"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`min-w-[120px] ${className}`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={`cursor-pointer rounded px-1 py-0.5 hover:bg-default-100 ${className}`}
      title="Click to edit (comma-separated)"
    >
      {value.length > 0 ? (
        value.join(", ")
      ) : (
        <span className="text-default-400">{placeholder || "—"}</span>
      )}
    </div>
  );
};
