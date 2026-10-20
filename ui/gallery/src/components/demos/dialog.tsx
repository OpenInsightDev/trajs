"use client";

import { Button } from "@trajs/ui-shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@trajs/ui-shadcn/dialog";

/**
 * A dialog cannot be rendered in the server graph a page is rendered in, so it
 * is shown from a client demo rather than written into the page.
 */
export function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Share session</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share session_8f2a</DialogTitle>
          <DialogDescription>
            Anyone with the link can read the conversation, including the tool payloads.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
