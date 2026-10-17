"use client";

import { Button } from "@trajs/shadcn/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@trajs/shadcn/sheet";

/**
 * The sheet, opened from a button. A sheet is a dialog anchored to an edge, and
 * so is one of the components the server graph cannot render; it is shown from
 * a client demo for the same reason a dialog is.
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
