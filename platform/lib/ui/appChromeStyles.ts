import clsx from "clsx";

/** Subtle elevation used on cards, toolbars, and panels. */
export const appShadowSm = "shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

export const appBorderSubtle = "border border-slate-200/80";

/** Grouped toolbar shell (editor header, calendar, navbar). */
export const appToolbarShellClass = `inline-flex flex-wrap items-center gap-0.5 rounded-xl ${appBorderSubtle} bg-white p-1 ${appShadowSm}`;

export const appToolbarDivider = "mx-0.5 hidden h-5 w-px shrink-0 bg-slate-200 sm:block";

export const appBtnBase =
  "h-8 min-h-8 min-w-0 gap-1.5 px-3 text-xs font-semibold tracking-tight shadow-none data-[hover=true]:opacity-100";

export const appBtnPrimary = `${appBtnBase} bg-weatherhead-primary text-white data-[hover=true]:bg-[#0f6fd0]`;

export const appBtnSecondary = `${appBtnBase} bg-transparent text-slate-600 data-[hover=true]:bg-slate-100 data-[hover=true]:text-slate-900`;

export const appBtnAccent = `${appBtnBase} bg-transparent text-weatherhead-primary data-[hover=true]:bg-sky-50`;

export const appPageTitleClass = "text-2xl font-bold tracking-tight text-slate-900";

export const appPageSubtitleClass = "text-sm text-slate-500";

export const appCardClass = `rounded-xl ${appBorderSubtle} bg-white ${appShadowSm}`;

export const appPanelClass = `rounded-xl ${appBorderSubtle} bg-gradient-to-b from-slate-50/80 to-white ${appShadowSm}`;

export const appInfoStripClass = `${appPanelClass} flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1.5`;

export const appBannerBase =
  "fixed inset-x-0 z-40 border-b px-4 py-2 backdrop-blur-sm sm:px-6 lg:px-8";

export const appBannerInfo = `${appBannerBase} border-sky-200/80 bg-sky-50/95`;

export const appBannerWarn = `${appBannerBase} border-amber-200/80 bg-amber-50/95`;

export const appNavLinkBase =
  "h-8 inline-flex items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors";

export const appNavLinkActive = "bg-sky-50 text-weatherhead-primary";

export const appNavLinkIdle = "text-slate-600 hover:bg-slate-100 hover:text-slate-900";

export function appNavLinkClass(active: boolean): string {
  return clsx(appNavLinkBase, active ? appNavLinkActive : appNavLinkIdle);
}

export const appSelectClass =
  "h-9 w-full rounded-lg border border-slate-200/90 bg-white px-3 text-sm text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-weatherhead-primary/20";

export const appFieldLabelClass =
  "mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500";

export const appChipClass =
  "inline-flex items-center rounded-md border border-slate-200/80 bg-slate-50/80 px-2 py-0.5 text-[10px] font-medium text-slate-600";

export const appPopoverPanelClass = `overflow-hidden rounded-xl ${appBorderSubtle} bg-white ${appShadowSm}`;

export const appPopoverHeaderClass = "border-b border-slate-100 px-3.5 py-2.5";

export const appFeedbackSuccessClass =
  "rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-3.5 py-2 text-sm font-medium leading-snug text-emerald-800";

export const appFeedbackErrorClass =
  "rounded-xl border border-red-200/80 bg-red-50/50 px-3.5 py-2 text-sm font-medium leading-snug text-red-800";

export const appNativeBtnPrimary =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-weatherhead-primary px-3 text-xs font-semibold text-white transition-colors hover:bg-[#0f6fd0]";

export const appNativeBtnSecondary =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200/90 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50";

export const appNativeBtnDanger =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-rose-200/80 bg-rose-50/80 px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100/80";

export const appIconBtnClass =
  "flex size-8 shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900";

export const appIconBtnPrimaryClass =
  "flex size-8 shrink-0 items-center justify-center rounded-md bg-weatherhead-primary text-white transition-colors hover:bg-[#0f6fd0] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400";

export const appIconBtnAccentClass =
  "flex size-8 shrink-0 items-center justify-center rounded-md border border-indigo-200/70 bg-indigo-50/80 text-indigo-700 transition-colors hover:bg-indigo-100/80";

export const appModalCloseBtnClass =
  "rounded-md border border-slate-200/90 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50";

/** @deprecated Use app* names — kept for editor imports. */
export const editorToolbarShellClass = appToolbarShellClass;
export const editorToolbarBtnBase = appBtnBase;
export const editorToolbarBtnPrimary = appBtnPrimary;
export const editorToolbarBtnSecondary = appBtnSecondary;
export const editorToolbarBtnAccent = appBtnAccent;
export const editorToolbarDivider = appToolbarDivider;
export const editorInfoStripClass = appInfoStripClass;
export const editorInfoLegendClass =
  "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500";
export const editorInfoMetaClass =
  "text-xs leading-relaxed text-slate-500 text-pretty sm:min-w-0 sm:flex-1";
export const editorFeedbackSuccessClass = appFeedbackSuccessClass;
export const editorFeedbackErrorClass = appFeedbackErrorClass;
export const editorTableAddBtnClass = `${appBtnBase} text-weatherhead-primary bg-sky-50/60 border border-sky-200/50 data-[hover=true]:bg-sky-100/80`;
export const editorFilterBtnClass = `${appBtnBase} text-slate-700 bg-white border border-slate-200/90 data-[hover=true]:bg-slate-50`;
export const editorFilterClearBtnClass = `${appBtnBase} px-2.5 text-xs font-medium text-slate-500 data-[hover=true]:bg-slate-100`;
