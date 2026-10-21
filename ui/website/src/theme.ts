/**
 * The site's theme: the two modes the file's colour variables hold, the one the
 * page is drawn in, and the switch between them.
 *
 * The class on `<html>` is the theme, not a copy of it: the root layout's script
 * puts `light` or `dark` there before the first paint (it reads the choice stored
 * under `theme`, and the system's setting when there is none), every token in
 * `app.css` states its value under that class, and the shader fills read the
 * same class through {@link useTheme}. A switch therefore paints in one place and
 * is followed everywhere, with nothing to keep in step.
 */

import { useSyncExternalStore } from "react";

/** `Color`, the file's variable collection, holds exactly these two modes. */
export type Theme = "light" | "dark";

/** The key the root layout's script reads the visitor's choice from. */
const storageKey = "theme";

const listeners = new Set<() => void>();

let watching: MutationObserver | null = null;

const notify = () => {
  for (const listener of listeners) listener();
};

const current = (): Theme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";

/** The lighting: the `<html>` class, watched rather than mirrored, so a class the
 * load script writes reads the same as one written here. */
const subscribe = (listener: () => void) => {
  listeners.add(listener);

  if (watching === null) {
    watching = new MutationObserver(notify);
    watching.observe(document.documentElement, { attributeFilter: ["class"], attributes: true });
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0) {
      watching?.disconnect();
      watching = null;
    }
  };
};

/**
 * The theme the page is drawn in.
 *
 * **Details**
 *
 * The server render has no theme to read, so it reports `dark` — the mode the
 * file's boards are drawn in, and so the one a fill that cannot see a switch is
 * painted as; the first client render then reads the class and the fill repaints
 * in the visitor's mode. Nothing about the markup differs between the two, so
 * hydrating does not warn and no visible surface flashes.
 */
export const useTheme = (): Theme => useSyncExternalStore(subscribe, current, () => "dark");

/**
 * Switches the page to `theme`, and leaves the visit in the state the next load
 * script would produce for it: the `<html>` class, `color-scheme` so the browser
 * paints its own chrome — scrollbars, form controls — in the same mode, and the
 * choice stored. The stored value is the mode that was picked rather than
 * `system`: a visitor who picks one means it, whatever their machine says next.
 */
export const setTheme = (theme: Theme) => {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;

  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    // Storage can be denied; the class alone still themes this visit.
  }

  notify();
};
