"use client";

import { useMemo } from "react";
import { Select, SelectItem } from "@heroui/select";
import { Autocomplete, AutocompleteItem } from "@heroui/autocomplete";

import {
  editorSelectPopoverProps,
  menuMinWidthForOptions,
} from "./editorDropdownWidth";

type EditableSelectCellProps = {
  value: string;
  options: { key: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  isSearchable?: boolean;
  isDisabled?: boolean;
};

export const EditableSelectCell = ({
  value,
  options,
  onChange,
  className = "",
  placeholder = "Select...",
  isSearchable = false,
  isDisabled = false,
}: EditableSelectCellProps) => {
  const menuMinWidth = useMemo(() => menuMinWidthForOptions(options), [options]);
  const popoverProps = useMemo(
    () => editorSelectPopoverProps(menuMinWidth),
    [menuMinWidth],
  );

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
        className={`w-full min-w-0 max-w-full ${className}`}
        placeholder={placeholder}
        aria-label={placeholder}
        defaultItems={options}
        isDisabled={isDisabled}
        popoverProps={popoverProps}
        listboxProps={{ style: { minWidth: menuMinWidth } }}
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
      className={`w-full min-w-0 max-w-full ${className}`}
      placeholder={placeholder}
      aria-label={placeholder}
      isDisabled={isDisabled}
      popoverProps={popoverProps}
      listboxProps={{ style: { minWidth: menuMinWidth } }}
    >
      {options.map((option) => (
        <SelectItem key={option.key}>{option.label}</SelectItem>
      ))}
    </Select>
  );
};
