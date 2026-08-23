"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Chip } from "@heroui/chip";

type TagInputProps = {
  value: string[];
  onChange: (value: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
};

export const TagInput = ({
  value,
  onChange,
  suggestions = [],
  placeholder = "Type and press Enter",
  className = "",
}: TagInputProps) => {
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, []);

  useEffect(() => {
    if (showDropdown) updatePosition();
  }, [showDropdown, updatePosition]);

  useEffect(() => {
    if (!showDropdown) return;
    const onScroll = () => updatePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [showDropdown, updatePosition]);

  const filteredSuggestions = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return [];
    return suggestions.filter(
      (s) =>
        s.toLowerCase().includes(q) &&
        !value.some((v) => v.toLowerCase() === s.toLowerCase()),
    );
  }, [inputValue, suggestions, value]);

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      if (value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;
      onChange([...value, trimmed]);
      setInputValue("");
      setShowDropdown(false);
      setHighlightedIndex(-1);
    },
    [value, onChange],
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter((v) => v !== tag));
    },
    [value, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredSuggestions.length) {
        addTag(filteredSuggestions[highlightedIndex]);
      } else if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeTag(value[value.length - 1]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) =>
        i < filteredSuggestions.length - 1 ? i + 1 : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) =>
        i > 0 ? i - 1 : filteredSuggestions.length - 1,
      );
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }, 150);
  };

  const exactMatch =
    inputValue.trim() &&
    filteredSuggestions.length === 0 &&
    !value.some((v) => v.toLowerCase() === inputValue.trim().toLowerCase());

  const dropdown =
    showDropdown && (filteredSuggestions.length > 0 || exactMatch)
      ? createPortal(
          <div
            style={{
              position: "absolute",
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              zIndex: 9999,
            }}
          >
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              {filteredSuggestions.map((s, i) => (
                <div
                  key={s}
                  className={`cursor-pointer px-3 py-1.5 text-sm ${
                    i === highlightedIndex
                      ? "bg-sky-100 text-sky-800"
                      : "hover:bg-slate-50"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(s);
                  }}
                  onMouseEnter={() => setHighlightedIndex(i)}
                >
                  {s}
                </div>
              ))}
              {exactMatch && (
                <div
                  className="cursor-pointer border-t border-slate-100 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(inputValue);
                  }}
                >
                  Create &quot;{inputValue.trim()}&quot;
                </div>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div
        className="flex min-h-[36px] cursor-text flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <Chip
            key={tag}
            size="sm"
            variant="flat"
            className="h-6 bg-slate-100 text-xs text-slate-700"
            onClose={() => removeTag(tag)}
          >
            {tag}
          </Chip>
        ))}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowDropdown(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-[80px] flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      {dropdown}
    </div>
  );
};
