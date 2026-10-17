"use client";

import { Button } from "@trajs/shadcn/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@trajs/shadcn/drawer";

/**
 * The drawer, opened from a button. A drawer is a client component — it holds
 * the gesture it is being swiped with — so it is shown from a client demo
 * rather than written into the page.
 */
export function DrawerDemo() {
  return (
    <Drawer showSwipeHandle>
      <DrawerTrigger render={<Button variant="outline" />}>Open drawer</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Filter the trajectory</DrawerTitle>
          <DrawerDescription>Show only the turns that produced a tool call.</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button>Apply</Button>
          <DrawerClose render={<Button variant="outline" />}>Cancel</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
