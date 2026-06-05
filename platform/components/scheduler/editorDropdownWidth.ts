/** Minimum popover width for editor Select / Autocomplete / MultiSelect menus. */
export const EDITOR_DROPDOWN_MIN_WIDTH_PX = 168;

/** Max popover width so very long option lists do not span the whole viewport. */
export const EDITOR_DROPDOWN_MAX_WIDTH_PX = 420;

const APPROX_CHAR_PX = 7.5;
const MENU_HORIZONTAL_PADDING_PX = 40;

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
  return {
    style: { minWidth: menuMinWidth },
    classNames: {
      content: "max-w-[min(420px,90vw)]",
    },
  };
}
