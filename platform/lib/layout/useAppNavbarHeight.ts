"use client";

import { useEffect, type RefObject } from "react";

export const APP_NAVBAR_HEIGHT_VAR = "--app-navbar-height";

/** Keeps `--app-navbar-height` in sync with the measured sticky navbar (progress bar, badges, etc.). */
export function useAppNavbarHeight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const sync = () => {
      document.documentElement.style.setProperty(
        APP_NAVBAR_HEIGHT_VAR,
        `${el.getBoundingClientRect().height}px`,
      );
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
      document.documentElement.style.removeProperty(APP_NAVBAR_HEIGHT_VAR);
    };
  }, [ref]);
}
