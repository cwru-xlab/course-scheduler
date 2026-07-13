import type { ReactNode } from "react";
import clsx from "clsx";

type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Optional right-aligned controls (buttons, toolbars). */
  actions?: ReactNode;
  className?: string;
};

/**
 * Standard page header used across all pages so the title/subtitle block has a
 * consistent height, typography, and alignment. Optional `actions` render on the
 * right and stay top-aligned with the title.
 */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div
      className={clsx(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col justify-start">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-base leading-6 text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
