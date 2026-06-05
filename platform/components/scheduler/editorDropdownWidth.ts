/** Minimum popover width for editor Select / Autocomplete / MultiSelect menus. */
export const EDITOR_DROPDOWN_MIN_WIDTH_PX = 168;

/** Max popover width so very long option lists do not span the whole viewport. */
export const EDITOR_DROPDOWN_MAX_WIDTH_PX = 420;

const APPROX_CHAR_PX = 7.5;
const MENU_HORIZONTAL_PADDING_PX = 56;

/** Truncate option labels while keeping the selection checkmark visible. */
export const EDITOR_SELECT_ITEM_CLASS_NAMES = {
  base: "min-w-0 max-w-full gap-2 data-[hover=true]:bg-default-100",
  title: "truncate min-w-0 flex-1",
  selectedIcon: "shrink-0",
};

export const EDITOR_AUTOCOMPLETE_ITEM_CLASS_NAMES = {
  base: "min-w-0 max-w-full",
  title: "truncate min-w-0",
};

export const EDITOR_AUTOCOMPLETE_CLASS_NAMES = {
  base: "min-w-0 max-w-full overflow-hidden",
};

/** Closed select trigger: clip chips/labels instead of horizontal scroll. */
export const EDITOR_SELECT_TRIGGER_CLASS_NAMES = {
  trigger: "min-h-unit-8 h-auto min-w-0 max-w-full overflow-hidden py-1",
  mainWrapper: "min-w-0 max-w-full overflow-hidden",
  innerWrapper: "min-w-0 max-w-full flex-wrap gap-1 overflow-hidden",
  value: "min-w-0 max-w-full truncate",
  selectorIcon: "shrink-0",
};

/**
 * Estimate a readable menu width from option labels (independent of narrow column width).
 */
export function menuMinWidthForOptions(
  options: { label: string }[],
  floor = EDITOR_DROPDOWN_MIN_WIDTH_PX,
): number {
  if (options.length === 0) return floor;
  const longest = options.reduce(
    (max, o) => Math.max(max, o.label.length),
    0,
  );
  const estimated = Math.ceil(longest * APPROX_CHAR_PX + MENU_HORIZONTAL_PADDING_PX);
  return Math.min(EDITOR_DROPDOWN_MAX_WIDTH_PX, Math.max(floor, estimated));
}

export function editorSelectPopoverProps(menuMinWidth: number) {
  const width = Math.min(menuMinWidth, EDITOR_DROPDOWN_MAX_WIDTH_PX);
  return {
    style: {
      minWidth: width,
      maxWidth: EDITOR_DROPDOWN_MAX_WIDTH_PX,
    },
    classNames: {
      content: "max-w-[min(420px,90vw)] overflow-x-hidden",
    },
  };
}

export function editorSelectListboxProps(menuMinWidth: number) {
  const width = Math.min(menuMinWidth, EDITOR_DROPDOWN_MAX_WIDTH_PX);
  return {
    style: {
      minWidth: width,
      maxWidth: EDITOR_DROPDOWN_MAX_WIDTH_PX,
    },
    className: "overflow-x-hidden max-w-[min(420px,90vw)]",
  };
}
