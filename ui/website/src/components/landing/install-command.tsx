"use client";

/**
 * `Install command` (224:331): the prompt, the command and the glyph that copies
 * it.
 *
 * The file draws no copied state, so the glyph is what changes — to the check on
 * the same grid — for as long as the confirmation lasts. The command is one of
 * the two ways onto the page the design offers; the buttons beside it link to
 * the docs.
 */

import { useEffect, useState } from "react";

import { CheckIcon, CopyIcon } from "./icons";

const command = "npm i effect @trajs/core";

/** How long the copied check stays in the glyph's place, in milliseconds. */
const confirmationMs = 1500;

export const InstallCommand = () => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timer = setTimeout(() => setCopied(false), confirmationMs);

    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // A browser that refuses the clipboard keeps the command on screen, where
      // it can still be selected; the glyph stays the copy glyph rather than
      // claiming a write that did not happen.
    }
  };

  return (
    <div className="flex h-12 items-center gap-[10px] rounded-full border border-border-strong px-[18px]">
      <span className="font-mono text-prompt text-ink-quiet">$</span>
      <code className="text-command text-ink-command">{command}</code>
      <button
        aria-label="Copy install command"
        className="text-ink-subtle transition-colors hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink-primary"
        onClick={copy}
        type="button"
      >
        {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Install command copied" : ""}
      </span>
    </div>
  );
};
