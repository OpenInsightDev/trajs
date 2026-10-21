"use client";

/**
 * `Header / Floating Glass` (224:285, 225:95, 225:277): the brand and the site's
 * navigation on a glass pill inset from the board's top edge.
 *
 * The glass is the file's `Effect / Glass` — the `Surface / Glass` fill under an
 * 11px blur — and the pill's height, inset, padding and radius are each board's
 * own, as are the type styles it carries. The navigation folds into the menu
 * below the tablet board, where the file stops drawing it.
 *
 * The pill is held back while the hero is what is on screen and comes down once
 * the page has been scrolled past the band it comes from, so the hero is read
 * first and the navigation arrives for the reading that follows. It arrives by
 * coming into focus rather than by sliding in: away it is clear and blurred, and
 * it settles to the glass the file draws, which is the same material sharpening.
 * It is `sticky` rather than `fixed` for that: the space the pill occupies stays
 * reserved, so the boards' layout does not move by the header's height when it is
 * away, and the pill's own inset is what it pins to. While it is away it is
 * `inert`, so nothing hidden can be tabbed into or clicked.
 */

import { useEffect, useRef, useState } from "react";

import { homeUrl, navigation } from "../../site-links";
import { BrandGlyph } from "./brand";
import { ArrowUpRightSmall } from "./icons";
import { MobileMenu } from "./mobile-menu";
import { ThemeToggle } from "./theme-toggle";

export const SiteHeader = () => {
  const header = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // The pill comes down once its own band has scrolled away: the inset and the
    // pill's height are each board's own, so the distance is read off the element
    // rather than written as a number that would only suit one board.
    const update = () => setShown(window.scrollY > (header.current?.offsetHeight ?? 0));

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <header
      className={`sticky top-0 z-20 mx-5 pt-[14px] tablet:mx-10 tablet:pt-8 desktop:mx-[72px] desktop:pt-10 wide:mx-[125px] wide:pt-[60px]`}
      inert={!shown}
      ref={header}
    >
      {/* The focus settles on the pill rather than on the header: an ancestor
          carrying `filter` or `opacity` becomes the pill's backdrop root, so the
          glass would have nothing behind it to blur until the transition ended —
          the frosted surface would arrive only after the pill had already
          appeared. On the pill itself the backdrop is sampled throughout, and
          what is blurred is the glass, sampling and all. */}
      <div
        className={`relative flex h-[52px] items-center justify-between rounded-[80px] bg-surface-glass px-[18px] backdrop-blur-[11px] transition-[opacity,filter] duration-200 ease-out tablet:h-[68px] tablet:px-7 desktop:h-[76px] desktop:px-8 wide:h-[90px] wide:px-10 motion-reduce:transition-none ${shown ? "opacity-100 blur-0" : "opacity-0 blur-sm"}`}
      >
        <a className="flex items-center gap-[10px]" href={homeUrl}>
          <BrandGlyph />
          <span className="text-wordmark text-ink-primary">TRAJS</span>
        </a>
        <div className="flex items-center gap-[26px]">
          <nav aria-label="Primary" className="hidden items-center gap-7 tablet:flex">
            {navigation.map((item) => (
              <a
                className="flex items-center gap-[6px] text-nav text-ink-muted transition-colors hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink-primary"
                href={item.href}
                key={item.label}
                {...(item.external ? { rel: "noreferrer noopener", target: "_blank" } : {})}
              >
                {item.label}
                {item.external ? <ArrowUpRightSmall className="size-[13px]" /> : null}
              </a>
            ))}
          </nav>
          <ThemeToggle />
          <MobileMenu visible={shown} />
        </div>
      </div>
    </header>
  );
};
