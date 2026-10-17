import type { ReactNode } from "react";

/**
 * The label a demo is read under, shared so that the labels read the same wherever
 * a demo is shown.
 */
export const Sample = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2">
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    {children}
  </div>
);
