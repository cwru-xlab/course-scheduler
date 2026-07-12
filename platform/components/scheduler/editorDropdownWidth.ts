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
  base: "w-full min-w-0 max-w-full overflow-hidden",
  listboxWrapper: "max-h-[min(320px,50vh)]",
  endContentWrapper: "items-center",
  selectorButton: "self-center",
};

/** Input field styling for searchable Autocomplete cells in editor tables. */
export const EDITOR_AUTOCOMPLETE_INPUT_PROPS = {
  classNames: {
    inputWrapper: "min-h-unit-8 h-unit-8 py-0 shadow-none bg-transparent data-[hover=true]:bg-default-100",
    innerWrapper: "items-center",
    input: "text-left text-sm",
  },
};

/** Closed select trigger: clip chips/labels instead of horizontal scroll. */
export const EDITOR_SELECT_TRIGGER_CLASS_NAMES = {
  base: "w-full min-w-0 max-w-full",
  trigger:
    "min-h-unit-8 h-unit-8 w-full min-w-0 max-w-full overflow-hidden py-0 flex items-center data-[hover=true]:bg-default-100",
  mainWrapper: "min-w-0 max-w-full overflow-hidden",
  innerWrapper: "min-w-0 max-w-full flex-nowrap gap-1 overflow-hidden",
  value: "min-w-0 max-w-full truncate text-left",
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
    // Anchor to trigger start so wide menus stay under the column (not shifted left).
    placement: "bottom-start" as const,
    offset: 4,
    // Keep the page scrollbar in place while the popover is open — otherwise
    // React Aria applies `overflow:hidden` to <body>, the scrollbar disappears,
    // and the viewport visibly widens by ~15px when the menu opens.
    shouldBlockScroll: false,
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
