"use client";

import { useState } from "react";
import { Button } from "@heroui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@heroui/popover";
import clsx from "clsx";
import { Settings } from "lucide-react";

import { SyncSettingsToggles } from "@/components/scheduler/SyncSettingsToggles";
import { navbarPopoverProps } from "@/lib/ui/navbarPopoverProps";

type NavbarSettingsMenuProps = {
  className?: string;
  /** Match main nav link styling when rendered in the center nav. */
  variant?: "nav" | "compact";
};

export function NavbarSettingsMenu({
  className,
  variant = "nav",
}: NavbarSettingsMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      placement="bottom-start"
      {...navbarPopoverProps}
    >
      <PopoverTrigger>
        <Button
          variant="light"
          className={clsx(
            variant === "nav"
              ? "px-4 py-2 text-sm font-semibold rounded-lg text-slate-600 dark:text-default-500 hover:text-weatherhead-primary hover:bg-slate-100 dark:hover:bg-default-50"
              : "min-w-0 px-2 text-slate-600",
            className,
          )}
          startContent={<Settings className="size-4" />}
        >
          {variant === "nav" ? "Sync options" : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold text-slate-900">Sync options</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Control how edits sync with the server and other users.
          </p>
        </div>
        <div className="p-2" onPointerDown={(e) => e.stopPropagation()}>
          <SyncSettingsToggles className="border-0 bg-transparent" />
        </div>
      </PopoverContent>
    </Popover>
  );
}
