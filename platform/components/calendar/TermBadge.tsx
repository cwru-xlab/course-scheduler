import clsx from "clsx";

import type { TermBadgeLabel } from "@/lib/scheduling/sectionTerm";

type TermBadgeProps = {
  badge: TermBadgeLabel;
  className?: string;
};

export function TermBadge({ badge, className }: TermBadgeProps) {
  if (!badge) return null;
  const label = badge === "half_any" ? "½?" : badge;
  const isUnresolved = badge === "half_any";
  return (
    <span
      className={clsx(
        "flex size-5 items-center justify-center rounded-md border text-[9px] font-black shadow-sm",
        isUnresolved
          ? "border-violet-300 bg-violet-50/95 text-violet-800"
          : "border-indigo-200 bg-indigo-50/95 text-indigo-800",
        className,
      )}
      title={
        badge === "H1"
          ? "1st half"
          : badge === "H2"
            ? "2nd half"
            : "Half (any) — assign 1st or 2nd half"
      }
      aria-label={label}
    >
      {label}
    </span>
  );
}
