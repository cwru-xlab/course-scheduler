/** Shared horizontal inset for navbar and full-bleed page content. */
export const pageHorizontalGutterClassName = "px-4 sm:px-6 lg:px-8";
export const pageHorizontalInsetRightClassName = "right-4 sm:right-6 lg:right-8";

const FULL_BLEED_ROUTE_PREFIXES = [
  "/editor",
  "/calendar",
  "/notes",
  "/history",
] as const;

export function isFullBleedRoute(pathname: string): boolean {
  return FULL_BLEED_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
