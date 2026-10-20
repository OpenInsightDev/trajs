"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The page's header: the brand and the links, in the glass pill the design floats
 * over the hero rather than a bar above it.
 *
 * The pill is the design's `Header / Floating Glass` — `155:2` on the light
 * ground and `153:2` on the dark one, as the hero frames `135:38` and `130:2`
 * draw them: 6 units down from the top of the canvas, 9 units tall, 167 of the
 * canvas's 192 units wide, 4 units of padding at either end, and rounded to its
 * full height. Its fill is white at 16% over the light ground and at 8% over the
 * dark one, and a hairline of white runs around its edge — at 24% where the light
 * ground would swallow a fainter line, at 8% where the dark one already shows it.
 *
 * The pill is glass made of three things: the design's fill, the light its rim
 * catches, and a plain blur of what is behind it. The blur is one `backdrop-blur`
 * at the same setting on either ground — no gradient, mask or second layer over
 * it — so that a headline or a button passing under the pill reads as something
 * behind glass rather than as something the pill is hiding.
 *
 * The pill is fixed to the window and away until the hero has been given its
 * first nudge of scroll: the design leaves the band it occupies empty, and it is
 * the page's only navigation, so it comes back rather than staying over the hero.
 * While it is away it is `inert`, which keeps its links out of the tab order and
 * out of what a reader is told the page holds.
 *
 * The pill arrives whole and fades in, but not by fading: a pane of glass cannot
 * take an opacity. The blur samples the page through the nearest backdrop root,
 * and an element held below full opacity is one — so for as long as the fade
 * lasts there is nothing behind the pill to blur, and the haze snaps in on the
 * last frame. That holds whether the opacity is on the pill or on a wrapper
 * around it, which is why the pill never takes one at all.
 *
 * Its material fades instead: the fill and the rim lose their alpha, the blur
 * closes from its full radius to none, and what the pill holds fades under them.
 * All three share `reveal`, so the header arrives as one thing rather than a pane
 * with its lettering following it in a moment later.
 */
const reveal = "duration-[400ms] ease-out motion-reduce:transition-none";

export const FloatingHeader = ({ children }: { children: ReactNode }) => {
  const [shown, setShown] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = top.current;

    if (!sentinel) return;

    const observer = new IntersectionObserver(([entry]) =>
      setShown(entry ? !entry.isIntersecting : false),
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* The first 24 pixels of the hero: while they are on screen the page is
          where it started, and the header waits. A sentinel rather than a scroll
          listener, so the window's own scrolling decides and no listener runs on
          every frame. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-6" ref={top} />
      {/* The pill keeps the blur and the box; the fill and the rim sit on a layer
          of their own, so they can fade without the blur being given an opacity to
          sample through. The wrapper never takes a click — it spans the width of
          the page — and the pill opts back in; while the pill is away `inert` is
          what keeps it from being reached at all. */}
      <div
        className="pointer-events-none fixed inset-x-0 top-[max(calc(6*var(--u)),16px)] z-50 flex justify-center px-[5%]"
        inert={!shown}
      >
        <header
          className={`pointer-events-auto relative flex min-h-[calc(9*var(--u))] w-full max-w-[calc(167*var(--u))] items-center rounded-full px-[calc(4*var(--u))] py-[calc(1*var(--u))] transition-[backdrop-filter] ${reveal} ${shown ? "backdrop-blur-lg" : "backdrop-blur-[0px]"}`}
        >
          <div
            aria-hidden
            className={`absolute inset-0 rounded-full bg-[rgba(255,255,255,0.16)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.24)] transition-opacity ${reveal} dark:bg-[rgba(255,255,255,0.08)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] ${shown ? "opacity-100" : "opacity-0"}`}
          />
          <div
            className={`relative flex w-full flex-wrap items-center justify-between gap-x-[calc(2.8*var(--u))] gap-y-2 transition-opacity ${reveal} ${shown ? "opacity-100" : "opacity-0"}`}
          >
            {children}
          </div>
        </header>
      </div>
    </>
  );
};
