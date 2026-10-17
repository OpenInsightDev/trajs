import { cn } from "cn";
import type { ReactNode } from "react";

/**
 * The surface a demo is shown on: the trajs palette, and none of the
 * documentation's. `not-prose` is what keeps Tailwind Typography's rules — which
 * Fumadocs applies to the page body — off the component inside it, so what a
 * reader compares is the component as an app renders it.
 */
export function Preview(props: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "not-prose my-5 rounded-xl bg-background p-5 text-foreground ring-1 ring-border",
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}
