"use client";

import { type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useBodyScrollLock } from "@/components/scheduler/editors/useBodyScrollLock";

type ViewportModalProps = {
  isOpen: boolean;
  onClose?: () => void;
  children: ReactNode;
  zIndex?: number;
  /** When false, backdrop clicks do not call onClose. Default true. */
  closeOnBackdropClick?: boolean;
};

/**
 * Portaled overlay centered in the viewport with background scroll locked.
 * Use for any popup modal so it stays visible without scrolling the page.
 */
export function ViewportModal({
  isOpen,
  onClose,
  children,
  zIndex = 1050,
  closeOnBackdropClick = true,
}: ViewportModalProps) {
  useBodyScrollLock(isOpen);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px] overscroll-none"
      style={{ zIndex }}
      role="presentation"
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      {children}
    </div>,
    document.body,
  );
}
