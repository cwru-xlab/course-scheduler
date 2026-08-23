"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Chip } from "@heroui/chip";
import { Check, ChevronDown, Plus } from "lucide-react";

type CompactChipSelectProps = {
  value: string[];
  onChange: (value: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
};

/**
 * Fixed-height chip summary for editor table cells.
 * Edits open in a portal dropdown so freeze-pane rows never grow.
 */
export function CompactChipSelect({
  value,
  onChange,
  suggestions = [],
  placeholder = "Select…",
  className = "",
  ariaLabel,
}: CompactChipSelectProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 240 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.max(rect.width, 240);
    let left = rect.left + window.scrollX;
    const maxLeft = window.scrollX + window.innerWidth - width - 8;
    left = Math.max(window.scrollX + 8, Math.min(left, maxLeft));
    setMenuPos({
      top: rect.bottom + window.scrollY + 4,
      left,
      width,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onReposition = () => updatePosition();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setInputValue("");
      setHighlightedIndex(-1);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const availableSuggestions = useMemo(() => {
    const selected = new Set(value.map((v) => v.toLowerCase()));
    return suggestions
      .filter((s) => !selected.has(s.toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [suggestions, value]);

  const filteredSuggestions = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return availableSuggestions;
    return availableSuggestions.filter((s) => s.toLowerCase().includes(q));
  }, [availableSuggestions, inputValue]);

  const canCreate =
    Boolean(inputValue.trim()) &&
    !value.some((v) => v.toLowerCase() === inputValue.trim().toLowerCase()) &&
    !suggestions.some((s) => s.toLowerCase() === inputValue.trim().toLowerCase());

  const listItems = useMemo(() => {
    const items: Array<{ kind: "suggest" | "create"; label: string }> =
      filteredSuggestions.map((s) => ({ kind: "suggest" as const, label: s }));
    if (canCreate) {
      items.push({ kind: "create", label: inputValue.trim() });
    }
    return items;
  }, [filteredSuggestions, canCreate, inputValue]);

  const addValue = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      if (value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;
      onChange([...value, trimmed]);
      setInputValue("");
      setHighlightedIndex(-1);
    },
    [value, onChange],
  );

  const removeValue = useCallback(
    (tag: string) => {
      onChange(value.filter((v) => v !== tag));
    },
    [value, onChange],
  );

  const toggleSuggestion = useCallback(
    (tag: string) => {
      if (value.some((v) => v.toLowerCase() === tag.toLowerCase())) {
        removeValue(tag);
      } else {
        addValue(tag);
      }
    },
    [value, addValue, removeValue],
  );

  const close = useCallback(() => {
    setOpen(false);
    setInputValue("");
    setHighlightedIndex(-1);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i < listItems.length - 1 ? i + 1 : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i > 0 ? i - 1 : listItems.length - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < listItems.length) {
        const item = listItems[highlightedIndex];
        addValue(item.label);
      } else if (inputValue.trim()) {
        addValue(inputValue);
      }
    }
  };

  const summaryTitle = value.length > 0 ? value.join(", ") : undefined;
  const extraCount = Math.max(0, value.length - 1);

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel ?? placeholder}
            style={{
              position: "absolute",
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              zIndex: 9999,
            }}
          >
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              {value.length > 0 ? (
                <div className="flex flex-wrap gap-1 border-b border-slate-100 px-2.5 py-2">
                  {value.map((tag) => (
                    <Chip
                      key={tag}
                      size="sm"
                      variant="flat"
                      className="h-6 bg-slate-100 text-xs text-slate-700"
                      onClose={() => removeValue(tag)}
                    >
                      {tag}
                    </Chip>
                  ))}
                </div>
              ) : null}

              <div className="border-b border-slate-100 px-2.5 py-2">
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setHighlightedIndex(-1);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Search or create…"
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-sky-300"
                />
              </div>

              <div className="max-h-48 overflow-y-auto py-1">
                {listItems.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-400">
                    {inputValue.trim()
                      ? "No matching suggestions"
                      : suggestions.length === 0
                        ? "Type to add a new value"
                        : "All suggestions selected"}
                  </div>
                ) : (
                  listItems.map((item, i) => {
                    const active = i === highlightedIndex;
                    if (item.kind === "create") {
                      return (
                        <button
                          key={`create:${item.label}`}
                          type="button"
                          className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                            active ? "bg-sky-100 text-sky-800" : "text-slate-600 hover:bg-slate-50"
                          }`}
                          onMouseEnter={() => setHighlightedIndex(i)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addValue(item.label);
                          }}
                        >
                          <Plus className="size-3.5 shrink-0" aria-hidden />
                          Create &quot;{item.label}&quot;
                        </button>
                      );
                    }
                    return (
                      <button
                        key={item.label}
                        type="button"
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                          active ? "bg-sky-100 text-sky-800" : "text-slate-700 hover:bg-slate-50"
                        }`}
                        onMouseEnter={() => setHighlightedIndex(i)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          toggleSuggestion(item.label);
                        }}
                      >
                        <Check className="size-3.5 shrink-0 opacity-0" aria-hidden />
                        {item.label}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`relative min-w-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel ?? placeholder}
        title={summaryTitle}
        onClick={() => {
          if (open) {
            close();
          } else {
            setOpen(true);
          }
        }}
        className="flex h-8 w-full min-w-0 max-w-full cursor-pointer items-center gap-1 overflow-hidden rounded-md border border-slate-200 bg-white px-1.5 text-left hover:border-slate-300"
      >
        {value.length === 0 ? (
          <span className="min-w-0 flex-1 truncate text-xs text-default-400">
            {placeholder}
          </span>
        ) : (
          <>
            <Chip
              size="sm"
              variant="flat"
              className="h-5 max-w-[min(100%,7rem)] shrink truncate bg-slate-100 text-[10px] leading-none text-slate-700"
            >
              {value[0]}
            </Chip>
            {extraCount > 0 ? (
              <Chip
                size="sm"
                variant="flat"
                className="h-5 shrink-0 bg-slate-50 text-[10px] leading-none text-slate-500"
              >
                +{extraCount}
              </Chip>
            ) : null}
            <span className="min-w-0 flex-1" />
          </>
        )}
        <ChevronDown
          className={`size-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}
