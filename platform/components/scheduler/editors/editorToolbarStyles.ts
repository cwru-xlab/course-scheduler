/** Compact toolbar controls shared across editor headers and table chrome. */

export const editorToolbarShellClass =
  "inline-flex flex-wrap items-center gap-0.5 rounded-xl border border-slate-200/80 bg-white p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

export const editorToolbarBtnBase =
  "h-8 min-h-8 min-w-0 gap-1.5 px-3 text-xs font-semibold tracking-tight shadow-none data-[hover=true]:opacity-100";

export const editorToolbarBtnPrimary = `${editorToolbarBtnBase} bg-weatherhead-primary text-white data-[hover=true]:bg-[#0f6fd0]`;

export const editorToolbarBtnSecondary = `${editorToolbarBtnBase} bg-transparent text-slate-600 data-[hover=true]:bg-slate-100 data-[hover=true]:text-slate-900`;

export const editorToolbarBtnAccent = `${editorToolbarBtnBase} bg-transparent text-weatherhead-primary data-[hover=true]:bg-sky-50`;

export const editorToolbarDivider = "mx-0.5 hidden h-5 w-px shrink-0 bg-slate-200 sm:block";

export const editorInfoStripClass =
  "lg:col-span-2 flex flex-col gap-2 rounded-xl border border-slate-200/70 bg-gradient-to-b from-slate-50/80 to-white px-3.5 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1.5";

export const editorInfoLegendClass = "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500";

export const editorInfoMetaClass = "text-xs leading-relaxed text-slate-500 text-pretty sm:min-w-0 sm:flex-1";

export const editorFeedbackSuccessClass =
  "lg:col-span-2 rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-3.5 py-2 text-sm font-medium leading-snug text-emerald-800";

export const editorFeedbackErrorClass =
  "lg:col-span-2 rounded-xl border border-red-200/80 bg-red-50/50 px-3.5 py-2 text-sm font-medium leading-snug text-red-800";

export const editorTableAddBtnClass =
  "h-8 min-h-8 gap-1 px-3 text-xs font-semibold text-weatherhead-primary bg-sky-50/60 border border-sky-200/50 data-[hover=true]:bg-sky-100/80 shadow-none";

export const editorFilterBtnClass =
  "h-8 min-h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-200/90 shadow-none data-[hover=true]:bg-slate-50";

export const editorFilterClearBtnClass =
  "h-8 min-h-8 px-2.5 text-xs font-medium text-slate-500 data-[hover=true]:bg-slate-100 shadow-none";
