import { Icon, Logo } from "@trajs/component";
import { cn } from "cn";
import type { ReactNode } from "react";

import { Sample } from "../sample";

/**
 * The colourways: the ground a logo sits on, the colour it is drawn in on it, and
 * what the pair is called. They are classes rather than inline styles so the demo
 * paints them the way an app that uses them would.
 */
const colourways = [
  { name: "brand black on brand white", className: "bg-[#F6F6F6] text-[#171717]" },
  { name: "brand white on brand black", className: "bg-[#171717] text-[#F6F6F6]" },
  { name: "gold on brand white", className: "bg-[#F6F6F6] text-[#D4AF37]" },
  { name: "gold on brand black", className: "bg-[#171717] text-[#D4AF37]" },
];

/** One colourway, named on itself in its own colour. */
const Colourway = ({
  colourway,
  children,
}: {
  colourway: (typeof colourways)[number];
  children: ReactNode;
}) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-6 rounded-xl px-6 py-8",
      colourway.className,
    )}
  >
    {children}
    <div className="text-center text-xs opacity-60">{colourway.name}</div>
  </div>
);

/**
 * The logo in the forms it is drawn in: the lockup and the mark alone, each in the
 * brand's colourways, and then the weight of the mark's lines and the size a
 * navbar gives the mark.
 */
export const BrandDemo = () => (
  <div className="flex flex-col gap-6">
    <Sample label="the lockup, in the colourways">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {colourways.map((colourway) => (
          <Colourway key={colourway.name} colourway={colourway}>
            <Logo className="h-16 w-auto" />
          </Colourway>
        ))}
      </div>
    </Sample>
    <Sample label="the mark alone, the same colourways">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {colourways.map((colourway) => (
          <Colourway key={colourway.name} colourway={colourway}>
            <Icon className="h-20 w-auto" />
          </Colourway>
        ))}
      </div>
    </Sample>
    <div className="flex flex-wrap items-end gap-10">
      <Sample label="the weight of the mark's lines — stroke-[2], as drawn, stroke-[4]">
        <div className="flex items-end gap-4">
          <Icon className="h-20 w-auto stroke-[2]" />
          <Icon className="h-20 w-auto" />
          <Icon className="h-20 w-auto stroke-[4]" />
        </div>
      </Sample>
      <Sample label="the size a navbar gives it — as drawn, and at the heaviest the frame takes">
        <div className="flex items-end gap-6">
          <Icon className="h-6 w-auto" />
          <Icon className="h-6 w-auto stroke-[4]" />
        </div>
      </Sample>
    </div>
  </div>
);
