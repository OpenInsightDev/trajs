/**
 * The index under the hero: `Index / Record`, `Index / Analysis` and `Index /
 * Exchange`, each a label, a line about what the step is and the way to read
 * more about it.
 *
 * The boards arrange it three ways. Mobile stacks the three entries behind one
 * hairline, with the link beside the label and the line under both; the tablet
 * board sets each entry on one row, label, line and link; the desktop boards put
 * the three side by side under the rule. The rule is `Border / Hairline`.
 */

import { indexEntries } from "../../site-links";
import { AnalysisIcon, ArrowUpRight, ExchangeIcon, RecordIcon } from "./icons";

const icons = [RecordIcon, AnalysisIcon, ExchangeIcon];

export const IndexSection = () => (
  <section
    aria-label="Sections"
    className="mt-auto px-5 pt-[34px] pb-[17px] tablet:px-10 tablet:pt-[60px] tablet:pb-[29px] desktop:px-[72px] desktop:pt-[45px] desktop:pb-[53px] wide:px-24 wide:pt-[62px] wide:pb-[76px]"
  >
    <ul className="grid grid-cols-[minmax(0,1fr)] border-t border-border-hairline pt-3 tablet:gap-x-0 tablet:pt-7 desktop:grid-cols-3 desktop:gap-x-12 desktop:pt-[18px] wide:gap-x-[76px] wide:pt-[22px] [&>li+li]:border-t [&>li+li]:border-border-hairline [&>li+li]:pt-3 [&>li:last-child]:pb-0 tablet:[&>li:last-child]:pb-[30px] desktop:[&>li+li]:border-t-0 desktop:[&>li+li]:pt-0 desktop:[&>li:last-child]:pb-0">
      {indexEntries.map((entry, index) => {
        const Icon = icons[index] ?? RecordIcon;

        return (
          <li
            className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-[7px] pb-3 tablet:grid-cols-[200px_460px_1fr] tablet:gap-x-0 tablet:gap-y-0 tablet:pb-[30px] desktop:min-h-[139px] desktop:grid-cols-1 desktop:pb-0 wide:min-h-[154px]"
            key={entry.label}
          >
            <h2 className="col-start-1 row-start-1 flex items-center gap-[10px] text-eyebrow text-ink-primary">
              <Icon className="size-5 shrink-0" />
              {entry.label}
            </h2>
            <p className="col-span-2 row-start-2 text-body text-ink-secondary tablet:col-span-1 tablet:col-start-2 tablet:row-start-1 desktop:col-span-1 desktop:col-start-1 desktop:row-start-2 desktop:mt-[23px] desktop:max-w-[400px] wide:max-w-[500px]">
              {entry.description}
            </p>
            <a
              className="col-start-2 row-start-1 flex items-center justify-self-end gap-2 font-mono text-label text-ink-primary transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink-primary tablet:col-start-3 tablet:ml-4 tablet:justify-self-start desktop:col-start-1 desktop:row-start-3 desktop:mt-[18px] desktop:ml-0 desktop:justify-self-start"
              href={entry.href}
            >
              {entry.action}
              <ArrowUpRight className="size-3" />
            </a>
          </li>
        );
      })}
    </ul>
  </section>
);
