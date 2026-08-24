"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@heroui/button";

import { ViewportModal } from "../ViewportModal";
import { useIslandNotify } from "@/components/GlobalStatusBar";
import { editorRowKey, rowHighlightClass } from "./editorRowHighlight";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

const MODAL_Z = 1060;

type PendingDelete = {
  rowLabel: string;
  onConfirm: () => void;
};

type EditorActionContextValue = {
  requestDelete: (opts: { rowLabel: string; onConfirm: () => void }) => void;
  showSuccess: (message: string) => void;
  confirmRowAdded: (opts: { rowKey: string; message: string }) => void;
  isRowRecentlyAdded: (rowKey: string) => boolean;
  getRowHighlightClass: (base: string, scope: string, rowId: string) => string;
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
  const { getRowChangeKind } = useSchedulingData();
  const { flash } = useIslandNotify();
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [highlightedRowKey, setHighlightedRowKey] = useState<string | null>(null);
  const highlightedRowKeyRef = useRef<string | null>(null);

  useEffect(() => {
    highlightedRowKeyRef.current = highlightedRowKey;
  }, [highlightedRowKey]);

  const showSuccess = useCallback(
    (message: string) => {
      flash({ tone: "success", message });
    },
    [flash],
  );

  const confirmRowAdded = useCallback(
    (opts: { rowKey: string; message: string }) => {
      setHighlightedRowKey(opts.rowKey);
      showSuccess(opts.message);
    },
    [showSuccess],
  );

  const isRowRecentlyAdded = useCallback(
    (rowKey: string) => highlightedRowKey === rowKey,
    [highlightedRowKey],
  );

  const getRowHighlightClass = useCallback(
    (base: string, scope: string, rowId: string) => {
      const rowKey = editorRowKey(scope, rowId);
      return rowHighlightClass(base, {
        added: highlightedRowKey === rowKey,
        changeKind: getRowChangeKind(rowKey),
      });
    },
    [getRowChangeKind, highlightedRowKey],
  );

  useEffect(() => {
    const clearOnNextAction = () => {
      if (!highlightedRowKeyRef.current) return;
      setHighlightedRowKey(null);
    };
    document.addEventListener("pointerdown", clearOnNextAction, true);
    document.addEventListener("keydown", clearOnNextAction, true);
    return () => {
      document.removeEventListener("pointerdown", clearOnNextAction, true);
      document.removeEventListener("keydown", clearOnNextAction, true);
    };
  }, []);

  const requestDelete = useCallback(
    (opts: { rowLabel: string; onConfirm: () => void }) => {
      setPendingDelete(opts);
    },
    [],
  );

  const value = useMemo(
    () => ({
      requestDelete,
      showSuccess,
      confirmRowAdded,
      isRowRecentlyAdded,
      getRowHighlightClass,
    }),
    [requestDelete, showSuccess, confirmRowAdded, isRowRecentlyAdded, getRowHighlightClass],
  );

  const confirmDelete = () => {
    if (!pendingDelete) return;
    pendingDelete.onConfirm();
    setPendingDelete(null);
  };

  return (
    <EditorActionContext.Provider value={value}>
      <ViewportModal
        isOpen={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        zIndex={MODAL_Z}
      >
        {pendingDelete ? (
          <div
            className="w-full max-w-md rounded-2xl border-2 border-rose-300 bg-rose-50 shadow-2xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="editor-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-rose-300 bg-rose-100/80 px-5 py-4 rounded-t-2xl">
              <h4 id="editor-delete-title" className="text-base font-black text-rose-950">
                Delete this row?
              </h4>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm text-rose-950">
              <p>
                Are you sure you want to delete{" "}
                <strong className="font-semibold">{pendingDelete.rowLabel}</strong>? This cannot be
                undone until you re-import or add the row again.
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
        ) : null}
      </ViewportModal>
      {children}
    </EditorActionContext.Provider>
  );
}
