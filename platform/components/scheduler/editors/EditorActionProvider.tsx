"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@heroui/button";

const MODAL_Z = 1060;
const BANNER_Z = 1040;
const BANNER_DURATION_MS = 6000;

type PendingDelete = {
  rowLabel: string;
  onConfirm: () => void;
};

type EditorActionContextValue = {
  requestDelete: (opts: { rowLabel: string; onConfirm: () => void }) => void;
  showSuccess: (message: string) => void;
};

const EditorActionContext = createContext<EditorActionContextValue | null>(null);

export function useEditorActions(): EditorActionContextValue {
  const ctx = useContext(EditorActionContext);
  if (!ctx) {
    throw new Error("useEditorActions must be used within EditorActionProvider");
  }
  return ctx;
}

export function EditorActionProvider({ children }: { children: ReactNode }) {
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const showSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
  }, []);

  const requestDelete = useCallback(
    (opts: { rowLabel: string; onConfirm: () => void }) => {
      setPendingDelete(opts);
    },
    [],
  );

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), BANNER_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const value = useMemo(
    () => ({ requestDelete, showSuccess }),
    [requestDelete, showSuccess],
  );

  const confirmDelete = () => {
    if (!pendingDelete) return;
    pendingDelete.onConfirm();
    setPendingDelete(null);
  };

  return (
    <EditorActionContext.Provider value={value}>
      {successMessage
        ? createPortal(
            <div
              className="fixed left-0 right-0 top-16 z-[1040] flex justify-center px-4 pt-2 pointer-events-none"
              style={{ zIndex: BANNER_Z }}
              role="status"
            >
              <div className="pointer-events-auto w-full max-w-3xl rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-lg">
                {successMessage}
              </div>
            </div>,
            document.body,
          )
        : null}
      {pendingDelete
        ? createPortal(
            <div
              className="fixed inset-0 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
              style={{ zIndex: MODAL_Z }}
              role="presentation"
              onClick={() => setPendingDelete(null)}
            >
              <div
                className="w-full max-w-md rounded-2xl border-2 border-rose-300 bg-rose-50 shadow-2xl"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="editor-delete-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-rose-300 bg-rose-100/80 px-5 py-4 rounded-t-2xl">
                  <h4
                    id="editor-delete-title"
                    className="text-base font-black text-rose-950"
                  >
                    Delete this row?
                  </h4>
                </div>
                <div className="space-y-3 px-5 py-4 text-sm text-rose-950">
                  <p>
                    Are you sure you want to delete{" "}
                    <strong className="font-semibold">{pendingDelete.rowLabel}</strong>? This
                    cannot be undone until you re-import or add the row again.
                  </p>
                </div>
                <div className="flex justify-end gap-2 border-t border-rose-200 px-5 py-4">
                  <Button variant="flat" onPress={() => setPendingDelete(null)}>
                    Cancel
                  </Button>
                  <Button color="danger" className="font-bold" onPress={confirmDelete}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {children}
    </EditorActionContext.Provider>
  );
}
