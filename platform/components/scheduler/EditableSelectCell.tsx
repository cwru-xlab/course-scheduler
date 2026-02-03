"use client";

import { Select, SelectItem } from "@heroui/select";

type EditableSelectCellProps = {
  value: string;
  options: { key: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
};

export const EditableSelectCell = ({
  value,
  options,
  onChange,
  className = "",
  placeholder = "Select...",
}: EditableSelectCellProps) => {
  return (
    <Select
      size="sm"
      selectedKeys={value ? [value] : []}
      onSelectionChange={(keys) => {
        const selected = Array.from(keys)[0] as string;
        if (selected && selected !== value) {
          onChange(selected);
        }
      }}
      className={`min-w-[100px] ${className}`}
      placeholder={placeholder}
      aria-label={placeholder}
    >
      {options.map((option) => (
        <SelectItem key={option.key}>{option.label}</SelectItem>
      ))}
    </Select>
  );
};
