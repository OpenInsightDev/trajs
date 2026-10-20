import { Icon, Logo } from "@trajs/component";
import { ArrowRight, ArrowRightLeft, ArrowUpRight, CircleDot, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

import { CopyCommand, installCommand } from "./copy-command";
import { FloatingHeader } from "./floating-header";
import { HeroGround, HeroMark } from "./hero-fills";
import { ThemeToggle } from "./theme-toggle";

/**
 * The landing page: the header the design floats over it, the hero, and the index
 * beneath it, in the two colourways the design draws it in — brand black on a
 * light ground and brand white on a dark one, which `dark:` follows.
 *
 * The design is a 1920 × 1080 canvas, so the page is laid out in a unit of that
 * canvas: `--u` is a 192nd of its width and a 108th of its height, whichever is
 * smaller. It is 10px at 1920 × 1080, and every length below is a multiple of it —
 * a 128px headline is `12.8u`, a 96px margin `9.6u` — so the header, the hero and
 * the index keep the design's proportions and still fit one screen at another
 * size, instead of fitting only the size they were drawn at.
 *
 * Two things interrupt that scale. Small type, the buttons and the gaps between
 * blocks have a floor in `max()`, because a window short enough to divide the unit
 * down would otherwise set its labels below reading size; and below `xl` the two
 * columns stack, because a phone's width divides the canvas down to a headline
 * four characters wide.
 *
 * The icons are Lucide's, drawn with `absoluteStrokeWidth` so that the weight is
 * the design's own hairline in pixels — 1.6 on the page's 16-pixel icons and 1.2 on
 * the switch's 12-pixel ones — rather than a weight that grows and shrinks with
 * them.
 */

const repository = "https://github.com/OpenInsightDev/trajs";

/**
 * Where the page's links go. The documentation is being rebuilt, so the
 * destinations that will become pages of this site are the repository's own
 * files and history until they do, rather than routes that would answer 404.
 */
const links = {
  docs: `${repository}/tree/main/packages/core`,
  examples: `${repository}/tree/main/examples`,
  blog: repository,
  changelog: `${repository}/commits/main`,
  repository,
};

const nav = [
  { label: "DOCS", href: links.docs },
  { label: "EXAMPLES", href: links.examples },
  { label: "BLOG", href: links.blog },
  { label: "CHANGELOG", href: links.changelog },
];

const index = [
  {
    title: "RECORD",
    icon: CircleDot,
    description: "Capture every thought, tool call and observation as a typed, timestamped step.",
    label: "DOCS",
    href: links.docs,
  },
  {
    title: "ANALYSIS",
    icon: TrendingUp,
    description: "Replay any run, diff two trajectories, and profile tokens, latency and cost.",
    label: "EXAMPLES",
    href: links.examples,
  },
  {
    title: "EXCHANGE",
    icon: ArrowRightLeft,
    description: "One portable file. Share a link, export to JSONL, or open it in any runtime.",
    label: "BLOG",
    href: links.blog,
  },
];

/**
 * The mono label the nav and the index links are set in, opened out 12%.
 *
 * The design sets it at two sizes — 14px in the header, 16px under the index
 * columns — so there are two of these. Both are written out rather than
 * composed, because Tailwind reads class names from the source: a name built at
 * runtime is a class that was never generated.
 */
const label = "font-mono text-[max(calc(1.4*var(--u)),12px)] tracking-[0.12em] uppercase";
const indexLabel = "font-mono text-[max(calc(1.6*var(--u)),14px)] tracking-[0.12em] uppercase";

/** A rule across the page, inset by its margins as the design draws one. */
const Rule = () => (
  <div className="h-px w-full shrink-0 bg-[rgba(23,23,23,0.12)] dark:bg-[rgba(255,255,255,0.12)]" />
);

/**
 * A link that leaves the page, opened in a tab of its own, as the arrow it carries
 * says. Every destination on this page is one while the site has a single page:
 * when they become routes, this is the component that changes.
 */
const ExternalLink = ({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className: string;
  href: string;
}) => (
  <a className={className} href={href} rel="noreferrer noopener" target="_blank">
    {children}
  </a>
);

/**
 * The mark with the name beside it, at the head of the pill. It leads back to the
 * page it is on, which is the site's own root: `BASE_URL`, the path the build is
 * served under, rather than `/`, so the mark still lands on the site where the
 * site is a directory on someone else's host.
 */
const Brand = () => (
  <a className="flex items-center gap-[calc(1*var(--u))]" href={import.meta.env.BASE_URL}>
    {/* The design draws the pill's mark as a filled path whose bars measure
        1.79658 of its 30 units, which at 30px is `Icon`'s 92 × 146 outline
        stroked at 8.74 — not the 2.07 it was exported at, a hairline the size
        the mark is read at the head of the page. */}
    <Icon aria-hidden className="h-[calc(3*var(--u))] w-auto stroke-[8.74]" />
    <span className="font-display text-[max(calc(2*var(--u)),16px)] font-light tracking-[0.11em]">
      TRAJS
    </span>
  </a>
);

/**
 * The page's links, at the far end of the pill, with the design's switch for the
 * ground they are read on beside them.
 *
 * They wrap under the mark on a narrow screen rather than being dropped. The
 * index repeats three of the four, but a page whose only navigation is below its
 * headline is not navigated.
 */
const Nav = () => (
  <div className="flex flex-wrap items-center gap-[calc(2.6*var(--u))]">
    <nav
      aria-label="The repository and its documentation"
      className="flex flex-wrap items-center gap-[calc(2.8*var(--u))]"
    >
      {nav.map((entry) => (
        <ExternalLink
          className={`${label} text-[#6b6b70] transition-colors hover:text-[#171717] dark:text-[#c4c4ca] dark:hover:text-[#f2f2ef]`}
          href={entry.href}
          key={entry.label}
        >
          {entry.label}
        </ExternalLink>
      ))}
      <ExternalLink
        className={`${label} flex items-center gap-[calc(0.6*var(--u))] text-[#6b6b70] transition-colors hover:text-[#171717] dark:text-[#c4c4ca] dark:hover:text-[#f2f2ef]`}
        href={links.repository}
      >
        GITHUB
        <ArrowUpRight
          aria-hidden
          absoluteStrokeWidth
          className="size-[calc(1.3*var(--u))] shrink-0"
          strokeWidth={1.6}
        />
      </ExternalLink>
    </nav>
    <ThemeToggle />
  </div>
);

/**
 * The hero: three verbs set flush against the lockup, and the two things to do
 * about them underneath.
 *
 * The headline and the buttons are one column against the lockup, both closed to
 * the same right edge, and all three are held to the bottom of the band so the
 * already-heavy left side reads as sitting on the rule below it.
 */
export const Hero = () => (
  <main className="relative isolate flex min-h-svh flex-col [--u:max(5.5px,min(0.5208vw,0.9259svh))] bg-[#f2f2ef] text-[#171717] dark:bg-[#353533] dark:text-[#f2f2ef]">
    <HeroGround />
    <FloatingHeader>
      <Brand />
      <Nav />
    </FloatingHeader>
    {/* The band the pill occupies is held clear of the page, as the design holds
        it clear of the hero: on a stacked screen the columns start at the top and
        would otherwise sit under the pill, where at `xl` they are held to the
        bottom of a filled screen and the band is the air above them. */}
    <div className="mx-auto flex min-h-svh w-full max-w-[calc(192*var(--u))] flex-col px-[5%] pt-[calc(15*var(--u))] xl:pt-0">
      {/* The columns are the design's: 38.25% of the measure for the headline,
          2.8% between, and 51.3% for the lockup, which leaves the design's 7.65%
          of trailing space at the right on its own.

          The band keeps the design's 10.34 units of air above and below it: the
          few pixels that used to be taken out of them, to keep the page within
          1280 × 720 while the masthead was in its flow, are the header's now. */}
      <div className="grid items-end gap-x-[2.8%] gap-y-[calc(3*var(--u))] pt-[max(calc(10.34*var(--u)),32px)] pb-[max(calc(10.34*var(--u)),32px)] xl:mt-auto xl:grid-cols-[38.25%_51.3%]">
        <div className="flex flex-col items-start gap-[max(calc(4.5*var(--u)),20px)] xl:items-end">
          {/* The headline is the one display run a step lighter than the 300 the
              rest of the page is set in. The design's headline face is not this
              one: it is set in Poppins Devanagari Light, a build of the family
              whose Latin glyphs are a touch narrower and, at 128px, markedly
              lighter than Poppins Light — its stems measure 7.4px where Poppins
              Light measures 9.5 and ExtraLight 6.3. ExtraLight is therefore the
              closest of the weights the family ships to what the design draws;
              Light puts about a third more ink on the page than the design has. */}
          <h1 className="w-full font-display text-[clamp(2.5rem,10vw,calc(12.8*var(--u)))] font-extralight leading-[1.1016] xl:text-right">
            <span className="block">Record.</span>
            {/* The design opens the second line out by 2% and closes the third
                up by the same, which is what makes three headlines of different
                lengths read as one block against the right edge. */}
            <span className="block tracking-[0.02em]">Analysis.</span>
            <span className="block -tracking-[0.02em]">Exchange.</span>
          </h1>
          <div className="flex flex-wrap items-center gap-[calc(1.2*var(--u))]">
            <div className="flex h-[max(calc(4.8*var(--u)),32px)] items-center gap-[calc(1*var(--u))] rounded-full border border-[rgba(23,23,23,0.18)] px-[max(calc(1.8*var(--u)),14px)] dark:border-[rgba(255,255,255,0.22)]">
              <span
                aria-hidden
                className="font-mono text-[max(calc(1.6*var(--u)),12px)] font-medium text-[#7b7b80] dark:text-[#6e6e75]"
              >
                $
              </span>
              <code className="font-mono text-[max(calc(1.7*var(--u)),14px)] tracking-[0.02em] text-[#353539] dark:text-[#e4e4e2]">
                {installCommand}
              </code>
              <CopyCommand />
            </div>
            <ExternalLink
              className="flex h-[max(calc(4.8*var(--u)),32px)] items-center gap-[calc(1*var(--u))] rounded-full bg-[#171717] px-[max(calc(2.4*var(--u)),18px)] font-display text-[max(calc(1.9*var(--u)),15px)] font-medium tracking-[0.01em] text-white dark:bg-[#f2f2ef] dark:text-[#0b0b0c]"
              href={links.docs}
            >
              Get started
              <ArrowRight
                aria-hidden
                absoluteStrokeWidth
                className="size-[max(calc(1.7*var(--u)),14px)] shrink-0"
                strokeWidth={1.6}
              />
            </ExternalLink>
          </div>
        </div>
        {/* The lockup's box is the mark's own drawing box, 92 × 146, and the ink
            starts 2.34 units into it. The design aligns the ink with the buttons
            beside it, so the box is nudged down by that inset. */}
        <div className="relative aspect-[250/146] w-[78%] max-w-[34rem] translate-y-[1.6%] xl:w-[calc(88.4*var(--u))] xl:max-w-none">
          <HeroMark />
          <Logo
            aria-label="trajs"
            className="absolute inset-0 h-full w-full stroke-[2.07]"
            role="img"
          />
        </div>
      </div>
      <Rule />
      {/* The index sits on the design's 828px rule and takes the design's 2.2u
          above it, and below it the design's 154-pixel column of type. The 7.9u
          under that column is what keeps the rule on the design's 828: the
          column sets at 151 against the design's 154, and the rule is what holds
          the whole band above it in place. */}
      {/* Three columns across the full 1728 the page sets its content in, so each
          is a 60u measure of the design's and the second and third start at 60u
          and 120u — no gutter between them. The design wraps each column's
          paragraph inside that measure rather than at it, which the paragraph's
          own 50u does on its own. */}
      <div className="grid gap-y-[max(calc(2.4*var(--u)),24px)] pt-[max(calc(2.2*var(--u)),12px)] pb-[max(calc(7.9*var(--u)),32px)] md:grid-cols-3">
        {index.map((entry) => (
          <section className="flex flex-col" key={entry.title}>
            <h2 className="flex items-center gap-[calc(1.25*var(--u))] font-display text-[max(calc(1.75*var(--u)),14px)] font-light tracking-[0.16em]">
              <entry.icon
                aria-hidden
                absoluteStrokeWidth
                className="size-[calc(1.6*var(--u))] shrink-0"
                strokeWidth={1.6}
              />
              {entry.title}
            </h2>
            <p className="mt-[max(calc(1.7*var(--u)),12px)] max-w-[calc(50*var(--u))] font-display text-[max(calc(2*var(--u)),16px)] font-light leading-[calc(3.3*var(--u))] tracking-[0.01em] text-[#5f5f66] dark:text-[#9c9ca3]">
              {entry.description}
            </p>
            <ExternalLink
              className={`${indexLabel} mt-[max(calc(1.8*var(--u)),12px)] flex items-center gap-[calc(0.8*var(--u))] text-[#171717] transition-colors hover:text-[#5f5f66] dark:text-[#ededea] dark:hover:text-[#9c9ca3]`}
              href={entry.href}
            >
              {entry.label}
              <ArrowUpRight
                aria-hidden
                absoluteStrokeWidth
                className="size-[calc(1.2*var(--u))] shrink-0"
                strokeWidth={1.6}
              />
            </ExternalLink>
          </section>
        ))}
      </div>
    </div>
    {/* The page goes on past the hero: the sections that will follow it are still
        to be written, and until they are, this is the ground the page scrolls
        into — and the space the header is read over, which is otherwise the one
        thing a page of a single screen cannot show. */}
    <div aria-hidden className="h-[60svh] shrink-0" />
  </main>
);
