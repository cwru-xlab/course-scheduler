/** Shared Popover settings for navbar panels (settings, live users). */
export const navbarPopoverProps = {
  /** Click to open — hover + portaled content is unreliable. */
  shouldCloseOnScroll: false,
  shouldBlockScroll: false,
  offset: 6,
  showArrow: true,
} as const;
