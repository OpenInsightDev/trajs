/**
 * The landing page: the file's `Hero` boards (224:194, 225:4, 225:186) and the
 * `Header / Floating Glass` above them.
 *
 * Every board is the same composition arranged three ways — the mark and the
 * headline swap places, the wordmark joins the lockup on the desktop boards, and
 * the index moves from a stack to a row — so the page is one tree whose order and
 * spacing follow the board the viewport is at, rather than four trees chosen
 * between. The spacing values are those boards'.
 */

import { LogoLockup } from "./brand";
import { CallsToAction } from "./cta";
import { IndexSection } from "./index-section";
import { Paper } from "./paper";
import { SiteHeader } from "./site-header";

export const LandingPage = () => (
  <main className="relative isolate flex min-h-svh flex-1 flex-col overflow-x-clip bg-surface-canvas font-display text-ink-primary">
    {/* The paper is the page's, not the first screen's: it fills the whole page
        and its painting is stated for a screen (see `paper.tsx`), so the hero is
        the composition the file draws and the rest is that same haze carried on
        rather than a stretch of it. */}
    <Paper className="pointer-events-none absolute inset-0 -z-10" />
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <section
        aria-labelledby="hero-headline"
        className="px-5 tablet:px-10 desktop:px-[72px] wide:px-24"
      >
        {/* One row of the mark, the headline and the buttons. The tablet board
            wraps the buttons under the pair; the desktop boards make the mark
            span both rows, so the buttons sit above the mark's lower edge the
            way the file draws them rather than below it. */}
        <div className="mt-[8px] flex flex-col items-center tablet:mt-[180px] tablet:flex-row tablet:flex-wrap tablet:items-start tablet:justify-center tablet:gap-x-[21px] tablet:gap-y-0 desktop:mt-[54px] desktop:grid desktop:grid-cols-[auto_auto] desktop:items-start desktop:justify-center desktop:gap-x-[28px] desktop:gap-y-0 wide:mt-[58px] wide:justify-start wide:gap-x-[49px]">
          <LogoLockup className="order-1 desktop:col-start-2 desktop:row-span-2 desktop:row-start-1 desktop:mt-[5px] wide:mt-[17px]" />
          <h1
            className="order-2 mt-[22px] text-center text-hero tablet:mt-0 tablet:w-[5.16em] tablet:text-left desktop:col-start-1 desktop:row-start-1 desktop:text-right"
            id="hero-headline"
          >
            <span className="block">Record.</span>
            <span className="block">Analysis.</span>
            <span className="block">Exchange.</span>
          </h1>
          {/* The buttons sit under the whole group on the desktop board; on the
              wide board the mark is tall enough to reach them, so they move under
              the headline and end with it, the way the file draws them. */}
          <div className="order-3 mt-[46px] flex w-full justify-center tablet:mt-[37px] desktop:col-span-2 desktop:col-start-1 desktop:row-start-2 desktop:mt-[57px] wide:col-span-1 wide:mt-[46px] wide:justify-end">
            <CallsToAction />
          </div>
        </div>
      </section>
      <IndexSection />
      {/* Temporary: one more screen under the index, so the page scrolls and the
          header's scroll behaviour can be tried on the boards that fit one screen.
          Delete this with the test. */}
      <div aria-hidden className="h-svh" />
    </div>
  </main>
);
