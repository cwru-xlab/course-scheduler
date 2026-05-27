"use client";

import { Select, SelectItem } from "@heroui/select";
import { Autocomplete, AutocompleteItem } from "@heroui/autocomplete";

type EditableSelectCellProps = {
  value: string;
  options: { key: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  isSearchable?: boolean;
};

export const EditableSelectCell = ({
  value,
  options,
  onChange,
  className = "",
  placeholder = "Select...",
  isSearchable = false,
}: EditableSelectCellProps) => {
  if (isSearchable) {
    return (
      <Autocomplete
        size="sm"
        selectedKey={value || null}
        onSelectionChange={(key) => {
          const selected = key ? String(key) : "";
          if (selected && selected !== value) {
            onChange(selected);
          }
        }}
        className={`min-w-[140px] ${className}`}
        placeholder={placeholder}
        aria-label={placeholder}
        defaultItems={options}
      >
        {(option) => (
          <AutocompleteItem key={option.key}>{option.label}</AutocompleteItem>
        )}
      </Autocomplete>
    );
  }

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
