"use client";

/**
 * The mobile header's menu: the two lines the file draws as its trigger, and the
 * navigation under a glass panel in the header's own material.
 *
 * The file draws the mobile header closed, so the panel is not a design node; it
 * reuses the header's surface, border and radius rather than inventing a second
 * one, and carries the same entries in the same order.
 *
 * It closes when the header it hangs from is hidden: the pill is held back until
 * the page scrolls, so a menu left open under a pill that has gone would be the
 * panel alone, with nothing to have opened it.
 */

import { useEffect, useState } from "react";

import { navigation } from "../../site-links";
import { ArrowUpRightSmall } from "./icons";

const triggerLabel = { open: "Close menu", closed: "Open menu" };

export const MobileMenu = ({ visible }: { visible: boolean }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!open) return;

    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", close);

    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <>
      <button
        aria-controls="mobile-menu"
        aria-expanded={open}
        aria-label={open ? triggerLabel.open : triggerLabel.closed}
        className="relative flex size-[22px] items-center justify-center tablet:hidden"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="relative block h-[10px] w-[22px]">
          <span
            className={`absolute left-0 top-0 h-[1.5px] w-full bg-ink-primary transition-transform duration-200 ${open ? "translate-y-[4.25px] rotate-45" : ""}`}
          />
          <span
            className={`absolute left-0 top-[8.5px] h-[1.5px] w-full bg-ink-primary transition-transform duration-200 ${open ? "-translate-y-[4.25px] -rotate-45" : ""}`}
          />
        </span>
      </button>
      {open ? (
        <div
          className="absolute inset-x-0 top-full mt-2 rounded-[24px] border border-border-hairline bg-surface-canvas p-6 tablet:hidden"
          id="mobile-menu"
        >
          <nav aria-label="Primary" className="flex flex-col gap-5">
            {navigation.map((item) => (
              <a
                className="flex items-center gap-[6px] text-nav text-ink-muted transition-colors hover:text-ink-primary"
                href={item.href}
                key={item.label}
                {...(item.external ? { rel: "noreferrer noopener", target: "_blank" } : {})}
              >
                {item.label}
                {item.external ? <ArrowUpRightSmall className="size-[13px]" /> : null}
              </a>
            ))}
          </nav>
        </div>
      ) : null}
    </>
  );
};
