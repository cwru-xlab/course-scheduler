"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@heroui/input";

type EditableArrayCellProps = {
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
  placeholder?: string;
  /** Keep empty-state placeholder on one line (for narrow table columns). */
  nowrapPlaceholder?: boolean;
};

export const EditableArrayCell = ({
  value,
  onChange,
  className = "",
  placeholder = "comma-separated",
  nowrapPlaceholder = false,
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

  const placeholderClass = nowrapPlaceholder
    ? "text-default-400 block truncate whitespace-nowrap"
    : "text-default-400";

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={`min-w-0 cursor-pointer overflow-hidden rounded px-1 py-0.5 hover:bg-default-100 ${className}`}
      title="Click to edit (comma-separated)"
    >
      {value.length > 0 ? (
        <span className={nowrapPlaceholder ? "block truncate" : undefined}>
          {value.join(", ")}
        </span>
      ) : (
        <span className={placeholderClass}>{placeholder || "—"}</span>
      )}
    </div>
  );
};
