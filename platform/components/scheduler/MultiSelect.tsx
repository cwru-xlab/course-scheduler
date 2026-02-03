"use client";

import { Select, SelectItem } from "@heroui/select";

type MultiSelectProps = {
  value: string[];
  options: { key: string; label: string }[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  label?: string;
};

export const MultiSelect = ({
  value,
  options,
  onChange,
  placeholder = "Select...",
  label,
}: MultiSelectProps) => {
  return (
    <Select
      size="sm"
      selectionMode="multiple"
      selectedKeys={new Set(value)}
      onSelectionChange={(keys) => {
        const selected = Array.from(keys) as string[];
        onChange(selected);
      }}
      className="min-w-[150px]"
      placeholder={placeholder}
      aria-label={label ?? placeholder}
      classNames={{
        trigger: "min-h-unit-8 h-auto py-1",
      }}
    >
      {options.map((option) => (
        <SelectItem key={option.key}>{option.label}</SelectItem>
      ))}
    </Select>
  );
};
