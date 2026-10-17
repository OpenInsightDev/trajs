"use client";

import { Button } from "@trajs/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@trajs/shadcn/dialog";

/**
 * The dialog, opened from a button. A dialog is one of the few components the
 * server graph cannot render — its module reaches a class defined over a client
 * dependency — so it is shown from a client demo rather than written into the
 * page, which is also what the mapping's demos do.
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
