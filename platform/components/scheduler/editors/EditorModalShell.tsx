"use client";

import { type ReactNode } from "react";

import { ViewportModal } from "../ViewportModal";

const MODAL_Z = 1050;

type EditorModalShellProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClass?: string;
};

export function EditorModalShell({
  isOpen,
  title,
  onClose,
  children,
  footer,
  maxWidthClass = "max-w-2xl",
}: EditorModalShellProps) {
  return (
    <ViewportModal isOpen={isOpen} onClose={onClose} zIndex={MODAL_Z}>
      <div
        className={`flex max-h-[min(85vh,720px)] w-full ${maxWidthClass} flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 id="editor-modal-title" className="text-lg font-black text-slate-900">
            {title}
          </h3>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto space-y-4 px-6 py-5 text-sm">{children}</div>
        {footer ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </ViewportModal>
  );
}
