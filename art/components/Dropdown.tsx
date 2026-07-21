"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "@/components/Icons";

/**
 * Branded replacement for the native <select> (user 2026-07-17: the OS
 * popup broke the look). Full listbox semantics: Enter/Space/arrows open,
 * arrows move the highlight, Enter selects, Escape closes, outside click
 * closes, aria-activedescendant tracks the highlight.
 *
 * onChange fires even when the already-selected option is picked again,
 * which lets Random re-selection reshuffle (a native select never re-fires).
 */
export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  id,
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
  id: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [open]);

  const openAt = (index: number) => {
    setHighlight(index < 0 ? 0 : index);
    setOpen(true);
  };

  const pick = (v: T) => {
    onChange(v);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openAt(options.findIndex((o) => o.value === value));
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(options[highlight].value);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-activedescendant={open ? `${id}-${options[highlight].value}` : undefined}
        onClick={() =>
          open ? setOpen(false) : openAt(options.findIndex((o) => o.value === value))
        }
        className="focus-ring flex h-9 cursor-pointer items-center gap-2 rounded-full border border-line-slate bg-surface pl-4 pr-3 text-[13px] font-medium text-fg transition-colors hover:border-fg-muted/40"
      >
        {selected.label}
        <ChevronDownIcon
          size={14}
          className={`text-fg-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute right-0 top-full z-20 mt-2 min-w-[164px] rounded-[12px] border border-line-slate bg-surface p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.65),0_0_20px_-12px_var(--color-accent)]"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${o.value}`}
              role="option"
              aria-selected={o.value === value}
              onPointerEnter={() => setHighlight(i)}
              onClick={() => pick(o.value)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                i === highlight ? "bg-surface-active text-accent" : "text-fg-body"
              }`}
            >
              {o.label}
              {o.value === value && <CheckIcon size={13} className="text-accent" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
