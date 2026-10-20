"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export const installCommand = "npm i effect @trajs/core";

/** How long the button says it copied, in milliseconds. */
const confirmation = 1600;

const icon = "size-[max(calc(1.6*var(--u)),14px)] shrink-0";

/**
 * The copy control at the end of the install pill.
 *
 * The design draws a copy icon there, so the icon is a button: the command is short
 * enough to select by hand, and pressing it is the shorter way. It says what it
 * copies with its label rather than only with its shape, and the box it is pressed
 * in is grown past the icon with padding and pulled back with the matching margin,
 * so the target is a thumb's and the pill is still the size the design draws.
 */
export const CopyCommand = () => {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(installCommand).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), confirmation);
      },
      // A browser can refuse the clipboard outside a secure context. The command
      // stays on screen and can still be selected, so the pill is left as it was.
      () => {},
    );
  };

  return (
    <button
      aria-label={copied ? "Copied" : "Copy the install command"}
      className="-m-1.5 grid shrink-0 place-items-center p-1.5 text-[#7b7b80] transition-colors hover:text-[#171717] dark:text-[#6e6e75] dark:hover:text-[#f2f2ef]"
      onClick={copy}
      type="button"
    >
      {copied ? (
        <Check aria-hidden absoluteStrokeWidth className={icon} strokeWidth={1.6} />
      ) : (
        <Copy aria-hidden absoluteStrokeWidth className={icon} strokeWidth={1.6} />
      )}
    </button>
  );
};
