/** Shared calendar hover mini-card (matches crosslist hover chrome). */
export function CalendarSectionHoverTip({
  title,
  instructor,
}: {
  title: string;
  instructor: string;
}) {
  return (
    <div
      className="absolute left-1/2 top-full z-[60] flex -translate-x-1/2 flex-col items-center pt-1 pointer-events-none"
      aria-hidden
    >
      <div className="h-2 w-px bg-slate-400/90" />
      <div className="min-w-[88px] max-w-[180px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-center shadow-lg ring-1 ring-slate-200/80">
        <div className="truncate text-[9px] font-black text-slate-900">{title}</div>
        <div className="truncate text-[8px] text-slate-500">{instructor}</div>
      </div>
    </div>
  );
}
