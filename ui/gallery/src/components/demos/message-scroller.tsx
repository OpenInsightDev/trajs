"use client";

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@trajs/shadcn/message-scroller";

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
