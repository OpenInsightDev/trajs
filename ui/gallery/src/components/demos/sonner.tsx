"use client";

import { Button } from "@trajs/ui-shadcn/button";
import { Toaster } from "@trajs/ui-shadcn/sonner";
import { toast } from "sonner";

/**
 * A toast is raised by an event rather than by the page being read, so the demo
 * is the buttons that raise one and the toaster they arrive on.
 */
export function ToasterDemo() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Toaster position="bottom-right" />
      <Button variant="outline" onClick={() => toast("Session imported")}>
        Default
      </Button>
      <Button variant="outline" onClick={() => toast.success("18 turns were read")}>
        Success
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.error("The file is not a trajectory this version reads")}
      >
        Error
      </Button>
      <Button variant="outline" onClick={() => toast.loading("Importing…", { duration: 2000 })}>
        Loading
      </Button>
    </div>
  );
}
