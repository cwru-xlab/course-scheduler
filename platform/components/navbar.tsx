"use client";

import clsx from "clsx";
import { Calendar as CalendarIcon, History, MessageSquare } from "lucide-react";
import NextLink from "next/link";
import { usePathname } from "next/navigation";

import { LiveUsersIndicator } from "@/components/LiveUsersIndicator";
import { NavbarSettingsMenu } from "@/components/NavbarSettingsMenu";
import { UserMenu } from "@/components/user-menu";
import { SolverProgressIndicator } from "@/components/SolverProgressIndicator";
import { isFullBleedRoute, pageHorizontalGutterClassName } from "@/lib/layout/pageGutters";

export const Navbar = () => {
  const pathname = usePathname();
  const isFullBleed = isFullBleedRoute(pathname);
  const isEditorActive = pathname.startsWith("/editor");
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-default-200 bg-white/80 dark:bg-default-100/80 backdrop-blur-md relative">
      <div
        className={clsx(
          isFullBleed
            ? `w-full ${pageHorizontalGutterClassName}`
            : `max-w-7xl mx-auto ${pageHorizontalGutterClassName}`,
        )}
      >
        <div className="flex h-16 items-center justify-between">
          <NextLink
            href="/"
            className="flex items-center gap-3 cursor-pointer"
          >
            <img
              src="/cwru.jpeg"
              alt="CWRU logo"
              className="h-9 w-auto object-contain"
            />
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-foreground">
              Weatherhead <span className="text-weatherhead-primary">Scheduler</span>
            </h1>
          </NextLink>

          <nav className="hidden md:flex items-center gap-1">
            <NextLink
              href="/editor/sections"
              className={clsx(
                "px-4 py-2 text-sm font-semibold rounded-lg transition-colors",
                isEditorActive
                  ? "bg-weatherhead-primary/10 text-weatherhead-primary dark:bg-weatherhead-primary/20"
                  : "text-slate-600 dark:text-default-500 hover:text-weatherhead-primary hover:bg-slate-100 dark:hover:bg-default-50",
              )}
            >
              Editor
            </NextLink>

            <NextLink
              href="/calendar"
              className={clsx(
                "px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2",
                pathname === "/calendar"
                  ? "bg-weatherhead-primary/10 text-weatherhead-primary dark:bg-weatherhead-primary/20"
                  : "text-slate-600 dark:text-default-500 hover:text-weatherhead-primary hover:bg-slate-100 dark:hover:bg-default-50",
              )}
            >
              <CalendarIcon className="size-4" />
              Calendar
            </NextLink>
            <NextLink
              href="/notes"
              className={clsx(
                "px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2",
                pathname === "/notes"
                  ? "bg-weatherhead-primary/10 text-weatherhead-primary dark:bg-weatherhead-primary/20"
                  : "text-slate-600 dark:text-default-500 hover:text-weatherhead-primary hover:bg-slate-100 dark:hover:bg-default-50",
              )}
            >
              <MessageSquare className="size-4" />
              Notes Feed
            </NextLink>
            <NextLink
              href="/history"
              className={clsx(
                "px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2",
                pathname === "/history"
                  ? "bg-weatherhead-primary/10 text-weatherhead-primary dark:bg-weatherhead-primary/20"
                  : "text-slate-600 dark:text-default-500 hover:text-weatherhead-primary hover:bg-slate-100 dark:hover:bg-default-50",
              )}
            >
              <History className="size-4" />
              History
            </NextLink>

            <NavbarSettingsMenu />
          </nav>

          <div className="flex flex-1 items-center justify-end gap-1 md:flex-none md:justify-end">
            <div id="calendar-navbar-slot" className="flex items-center gap-2" />
            <div className="md:hidden">
              <NavbarSettingsMenu variant="compact" />
            </div>
            <LiveUsersIndicator />
            <div className="ml-2">
              <UserMenu />
            </div>
          </div>
        </div>
      </div>
      <SolverProgressIndicator />
    </header>
  );
};
