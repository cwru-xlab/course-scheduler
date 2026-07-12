"use client";

import Link from "next/link";
import { Avatar } from "@heroui/avatar";
import { Button } from "@heroui/button";
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  DropdownSection,
} from "@heroui/dropdown";
import { LogOut } from "lucide-react";

import { useAuth } from "@/lib/auth-client";
import { LOGOUT_UNSAVED_CONFIRM_MESSAGE } from "@/lib/scheduling/unsavedChanges";
import { useSchedulingData } from "@/lib/scheduling/useSchedulingData";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenu() {
  const { user, loading, logout } = useAuth();
  const { hasUnsavedChanges } = useSchedulingData();

  if (loading) {
    return (
      <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-default-200 animate-pulse" />
    );
  }

  if (!user) {
    return (
      <Button
        as={Link}
        href="/login"
        size="sm"
        color="primary"
        variant="flat"
        className="font-semibold"
      >
        Sign in
      </Button>
    );
  }

  const initials = initialsOf(user.name);

  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full px-1 py-1 pr-2 hover:bg-slate-100 dark:hover:bg-default-50 transition-colors"
          aria-label="User menu"
        >
          <Avatar
            name={initials}
            size="sm"
            className="bg-weatherhead-primary/10 text-weatherhead-primary font-semibold"
          />
          <span className="hidden md:inline text-sm font-medium text-slate-700 dark:text-default-700 max-w-48 truncate">
            {user.name}
          </span>
        </button>
      </DropdownTrigger>
      <DropdownMenu aria-label="User actions" variant="flat">
        <DropdownSection showDivider>
          <DropdownItem
            key="profile"
            isReadOnly
            className="opacity-100 cursor-default"
            textValue={user.name}
          >
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{user.name}</span>
              <span className="text-xs text-default-500">{user.email}</span>
              {user.authProvider === "dev" ? (
                <span className="text-[10px] mt-1 uppercase tracking-wide text-warning-600 font-semibold">
                  Dev session
                </span>
              ) : null}
            </div>
          </DropdownItem>
        </DropdownSection>
        <DropdownItem
          key="logout"
          color="danger"
          startContent={<LogOut className="size-4" />}
          onPress={() => {
            if (
              hasUnsavedChanges &&
              !window.confirm(LOGOUT_UNSAVED_CONFIRM_MESSAGE)
            ) {
              return;
            }
            void logout();
          }}
        >
          Sign out
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
