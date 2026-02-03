"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@heroui/input";

type EditableCellProps = {
  value: string | number;
  onChange: (value: string | number) => void;
  type?: "text" | "number";
  className?: string;
  placeholder?: string;
};

export const EditableCell = ({
  value,
  onChange,
  type = "text",
  className = "",
  placeholder = "",
}: EditableCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(String(value));
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    setIsEditing(false);
    const newValue = type === "number" ? Number(editValue) || 0 : editValue;
    if (newValue !== value) {
      onChange(newValue);
    }
  }, [editValue, onChange, type, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSave();
      } else if (e.key === "Escape") {
        setEditValue(String(value));
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
        type={type}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`min-w-[60px] ${className}`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={`cursor-pointer rounded px-1 py-0.5 hover:bg-default-100 ${className}`}
      title="Click to edit"
    >
      {value || <span className="text-default-400">{placeholder || "—"}</span>}
    </div>
  );
};
