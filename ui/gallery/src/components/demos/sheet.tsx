"use client";

import { Button } from "@trajs/ui-shadcn/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@trajs/ui-shadcn/sheet";

/**
 * A sheet is a dialog anchored to an edge, and cannot be rendered in the server
 * graph a page is rendered in, so it is shown from a client demo.
 */
export function SheetDemo() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>Open filters</SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>What the trajectory's turns are narrowed to.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button>Apply</Button>
          <SheetClose render={<Button variant="outline" />}>Reset</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
