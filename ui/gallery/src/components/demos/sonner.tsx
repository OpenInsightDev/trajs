"use client";

import { Button } from "@trajs/shadcn/button";
import { Toaster } from "@trajs/shadcn/sonner";
import { toast } from "sonner";

/**
 * The toaster and the calls that fill it. A toast is raised by an event rather
 * than by the page being read, so what a page can show is the button that
 * raises one — which is what this demo is.
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
