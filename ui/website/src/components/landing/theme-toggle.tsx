"use client";

/**
 * The theme control (`Theme Toggle`, 230:78 / 224:299 / 225:109 / 225:291): the
 * sun and the moon in one 52 × 28 track, the segment of the mode the page is in
 * filled the way the file fills it.
 *
 * The two segments are the file's own variables rather than a conditional style,
 * so the control is drawn by the theme: `Control / Segment Light` is the white
 * pill in the light mode and clear in the dark one, `Control / Segment Dark` the
 * reverse — which is why the dark board shows the moon filled and the light
 * variable set shows the sun. Each icon is stroked with the token the file strokes
 * it with, `Border / Icon` for the sun and `Ink / Thumb` for the moon, so the pair
 * reads in both modes with no state to keep in step.
 *
 * A press hands the mode to `src/theme.ts`, which writes the class the page and
 * its fills are drawn from and stores the choice the next visit loads with.
 */

import { setTheme, useTheme } from "../../theme";
import { MoonIcon, SunIcon } from "./icons";

const segment =
  "grid size-6 place-items-center rounded-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-primary";

export const ThemeToggle = () => {
  const theme = useTheme();

  return (
    <div
      aria-label="Theme"
      className="flex shrink-0 items-center rounded-[14px] border border-surface-control-border bg-surface-control p-px"
      role="group"
    >
      <button
        aria-label="Light theme"
        aria-pressed={theme === "light"}
        className={`${segment} bg-control-segment-light text-border-icon`}
        onClick={() => setTheme("light")}
        type="button"
      >
        <SunIcon className="size-3" />
      </button>
      <button
        aria-label="Dark theme"
        aria-pressed={theme === "dark"}
        className={`${segment} bg-control-segment-dark text-ink-thumb`}
        onClick={() => setTheme("dark")}
        type="button"
      >
        <MoonIcon className="size-6" />
      </button>
    </div>
  );
};
