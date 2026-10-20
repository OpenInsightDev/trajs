"use client";

import { useTheme } from "fumadocs-ui/provider/base";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";

/** The glyph's ink: the ground that is on, and the one that is not. */
const ink = {
  on: "text-[rgba(23,23,28,0.9)] dark:text-[rgba(255,255,255,0.94)]",
  off: "text-[rgba(23,23,28,0.38)] hover:text-[rgba(23,23,28,0.62)] dark:text-[rgba(255,255,255,0.42)] dark:hover:text-[rgba(255,255,255,0.62)]",
};

/**
 * One half of the switch: the thumb the design lights behind the ground that is
 * on, and the glyph that says which ground that is.
 */
const Segment = ({
  active,
  children,
  label,
  onSelect,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onSelect: () => void;
}) => (
  <button
    aria-label={`${label} theme`}
    aria-pressed={active}
    className={`relative flex size-[calc(2.4*var(--u))] items-center justify-center rounded-full transition-colors ${active ? ink.on : ink.off}`}
    onClick={onSelect}
    type="button"
  >
    {active ? (
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.1)] dark:bg-[rgba(255,255,255,0.14)] dark:shadow-none"
      />
    ) : null}
    <span className="relative flex items-center justify-center">{children}</span>
  </button>
);

/**
 * The design's `Theme Toggle` (`170:15`): the sun and the moon in a switch, with a
 * thumb behind the ground the page is drawn in.
 *
 * The two segments are 2.4 units square in a 1.4-unit capsule, which is the
 * design's 24 in a 28-high pill of 52 — the border and the padding are the
 * hairline and the pixel the design sets beside the segments, and they do not
 * scale with the unit, so the control stays a control at any size.
 *
 * Each segment is a button rather than two halves of one: they say which ground
 * the page is on with `aria-pressed`, and either can be asked for from either.
 * The theme is `next-themes`', through the provider the documentation's own
 * switch uses, so the choice is the same one and is remembered.
 *
 * The two grounds are drawn from the design's own two: the dark one is `170:15`,
 * and the light one is the switch `155:2` draws on the light pill — where the
 * thumb is white and casts a short shadow, the track a 5% black and its edge 12%.
 */
export const ThemeToggle = () => {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div
      aria-label="Colour scheme"
      className="flex items-center rounded-[calc(1.4*var(--u))] border border-[rgba(0,0,0,0.12)] bg-[rgba(0,0,0,0.05)] p-px dark:border-[rgba(255,255,255,0.13)] dark:bg-[rgba(255,255,255,0.06)]"
      role="group"
    >
      <Segment active={resolvedTheme === "light"} label="Light" onSelect={() => setTheme("light")}>
        <Sun
          aria-hidden
          absoluteStrokeWidth
          className="size-[calc(1.2*var(--u))]"
          strokeWidth={1.2}
        />
      </Segment>
      <Segment active={resolvedTheme === "dark"} label="Dark" onSelect={() => setTheme("dark")}>
        {/* The design fills its moon, so this one is filled where the sun is drawn. */}
        <Moon aria-hidden className="size-[calc(1.2*var(--u))]" fill="currentColor" stroke="none" />
      </Segment>
    </div>
  );
};
