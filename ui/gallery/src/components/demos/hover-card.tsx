"use client";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@trajs/shadcn/hover-card";

/**
 * The hover card, opened by resting on what it previews. Like a dialog, its
 * module cannot be rendered in the server graph, so the page shows this demo
 * rather than the card itself.
 */
export function HoverCardDemo() {
  return (
    <HoverCard>
      <HoverCardTrigger href="#" className="font-medium underline underline-offset-4">
        session_8f2a
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="flex flex-col gap-1">
          <span className="font-medium">18 turns</span>
          <span className="text-muted-foreground">
            Produced 10 minutes ago, and continues from session_31c7 at turn 4.
          </span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
