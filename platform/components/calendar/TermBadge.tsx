import clsx from "clsx";

type TermBadgeLabel = "H1" | "H2" | null;

type TermBadgeProps = {
  badge: TermBadgeLabel;
  className?: string;
};

export function TermBadge({ badge, className }: TermBadgeProps) {
  if (!badge) return null;
  return (
    <span
      className={clsx(
        "flex size-5 items-center justify-center rounded-md border text-[9px] font-black shadow-sm",
        "border-indigo-200 bg-indigo-50/95 text-indigo-800",
        className,
      )}
      title={badge === "H1" ? "1st half" : "2nd half"}
      aria-label={badge}
    >
      {badge}
    </span>
  );
}
