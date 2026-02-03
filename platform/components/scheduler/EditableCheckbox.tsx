"use client";

import { Checkbox } from "@heroui/checkbox";

type EditableCheckboxProps = {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string;
};

export const EditableCheckbox = ({
  value,
  onChange,
  label,
}: EditableCheckboxProps) => {
  return (
    <Checkbox
      isSelected={value}
      onValueChange={onChange}
      size="sm"
    >
      {label}
    </Checkbox>
  );
};
