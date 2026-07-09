"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

import clsx from "clsx";

type EditorFeedbackToastProps = {
  message: string | null;
  variant?: "success" | "neutral";
  onDismiss: () => void;
};

/** Fixed below the navbar — matches calendar drag valid/invalid toast styling. */
export function EditorFeedbackToast({
  message,
  variant = "success",
  onDismiss,
}: EditorFeedbackToastProps) {
  if (typeof document === "undefined") return null;

  const isSuccess = variant === "success";

  return createPortal(
    <AnimatePresence>
      {message ? (
        <motion.div
          key={message}
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-16 z-[45] flex justify-center px-4 pt-2 sm:px-6"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className={clsx(
              "pointer-events-auto flex w-full max-w-3xl items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur-md",
              isSuccess &&
                "border-emerald-200 bg-emerald-50/95 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100",
              !isSuccess &&
                "border-slate-200 bg-white/95 text-slate-800 dark:border-default-200 dark:bg-default-100/95 dark:text-foreground",
            )}
          >
            <span className="min-w-0 flex-1 leading-snug">{message}</span>
            <button
              type="button"
              className={clsx(
                "shrink-0 rounded-md p-0.5",
                isSuccess &&
                  "text-emerald-700/80 hover:bg-emerald-100/80 hover:text-emerald-900 dark:text-emerald-200 dark:hover:bg-emerald-500/20",
                !isSuccess &&
                  "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-default-400 dark:hover:bg-default-200/40",
              )}
              onClick={onDismiss}
              aria-label="Dismiss message"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
