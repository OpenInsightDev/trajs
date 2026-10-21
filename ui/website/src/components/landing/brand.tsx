/**
 * The brand, drawn the way the design draws it.
 *
 * The mark's outline and the wordmark are the file's own vector exports, kept as
 * inline drawings (`brand-art.tsx`) so their ink is `Ink / Primary` in whichever
 * mode the page is in: one path set scaled by the box it is drawn in, so every
 * board's size is the same drawing. The mark is a landscape frame divided by a
 * diagonal and a fan of lines, turned a quarter turn; the pigment fill sits
 * inside it, under the outline, clipped to the triangle the file masks it with.
 */

import { MarkGlyph, MarkOutline, Wordmark } from "./brand-art";
import { MarkFill } from "./mark-fill";

/**
 * The mark alone, at the width its box is given: the pigment, then the frame over
 * it. The drawing is landscape and the box portrait, as the file exports it, so
 * the frame turns with the box and its stroke scales with the box too.
 */
const Mark = ({ className }: { className?: string }) => (
  <div className={`relative aspect-[308.472/499.118] shrink-0 ${className ?? ""}`}>
    {/* `Gradient Fill` (224:322): the mark's width, 402.866/308.472 of it tall,
        clipped to the triangle its mask cuts. The mask is drawn landscape and
        turned a quarter turn with the mark, so its corners are the turned ones:
        top-left, 61.35% down the left edge, the bottom at its middle, and the
        right edge at 76.56%. */}
    <div className="absolute inset-x-0 top-0 aspect-[308.472/402.866] [clip-path:polygon(0%_0%,0%_61.35%,50.47%_100%,100%_76.56%)]">
      <MarkFill className="size-full" />
    </div>
    {/* `Mark Outline` (224:323): landscape, rotated into the portrait box. */}
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="relative h-[61.8%] w-[161.8%] flex-none rotate-90 text-ink-primary">
        <div className="absolute inset-[-1.18%_-0.73%]">
          <MarkOutline className="block size-full" />
        </div>
      </div>
    </div>
  </div>
);

/**
 * The lockup: the mark, and the wordmark beside it on the boards that draw one.
 *
 * The distances are the file's own, as fractions of the mark's width, so the
 * lockup is one drawing at every board's `--mark`. Only the desktop boards carry
 * the wordmark; the tablet and mobile boards draw the mark alone.
 */
export const LogoLockup = ({ className }: { className?: string }) => (
  <div
    className={`flex shrink-0 items-start gap-[calc(var(--mark)*0.1973)] [--mark:116.52px] tablet:[--mark:147.604px] desktop:[--mark:222.1px] wide:[--mark:308.472px] ${className ?? ""}`}
  >
    <Mark className="w-[var(--mark)]" />
    <Wordmark className="mt-[calc(var(--mark)*0.7943)] hidden w-[calc(var(--mark)*1.676)] max-w-none shrink-0 text-ink-primary desktop:block" />
  </div>
);

/** The mark as a solid glyph, at the 19.227 × 30 the header draws it. */
export const BrandGlyph = () => (
  <span className="flex h-[30px] w-[19.227px] items-center justify-center text-ink-primary">
    <MarkGlyph className="block h-[19.227px] w-[30px] max-w-none flex-none rotate-90" />
  </span>
);
