"use client";

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@trajs/shadcn/message-scroller";

/**
 * A message scroller reads the viewport and holds its scroll position, so it is
 * shown from a client demo rather than written into the page.
 */
export function MessageScrollerDemo() {
  const turns = Array.from({ length: 12 }, (_, index) => index + 1);

  return (
    <MessageScrollerProvider defaultScrollPosition="start">
      <MessageScroller className="h-64 rounded-lg border">
        <MessageScrollerViewport>
          <MessageScrollerContent className="gap-4 p-4">
            {turns.map((turn) => (
              <MessageScrollerItem key={turn}>
                <div className="rounded-lg bg-muted px-3 py-2 text-sm">
                  {`turn ${turn} — the model answered with one tool call`}
                </div>
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
