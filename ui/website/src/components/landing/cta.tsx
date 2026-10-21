/**
 * `CTAs` (224:330, 225:140, 225:325): the install command and the way into the
 * docs.
 *
 * The desktop and tablet boards pair the command with `Get started`; the mobile
 * board drops the command for a second full-width button, `Docs`, which is the
 * one place the design draws two buttons of equal width. Both buttons are the
 * file's 48px pill, one on `Action / Primary` and one outlined in
 * `Border / Strong`.
 */

import { docsUrl } from "../../site-links";
import { ArrowRight } from "./icons";
import { InstallCommand } from "./install-command";

const buttonClassName =
  "flex h-12 items-center justify-center gap-[10px] rounded-full text-button transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-primary";

export const CallsToAction = () => (
  <div className="flex w-full items-center gap-[10px] tablet:w-auto tablet:gap-[12px]">
    <div className="hidden tablet:block">
      <InstallCommand />
    </div>
    <a
      className={`${buttonClassName} flex-1 bg-action-primary px-4 text-ink-on-action hover:bg-ink-primary/90 tablet:flex-none tablet:px-6`}
      href={docsUrl}
    >
      Get started
      <ArrowRight className="size-[17px]" />
    </a>
    <a
      className={`${buttonClassName} flex-1 border border-border-strong px-4 text-ink-primary hover:bg-surface-glass tablet:hidden`}
      href={docsUrl}
    >
      Docs
      <ArrowRight className="size-[17px]" />
    </a>
  </div>
);
