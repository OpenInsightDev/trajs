// The names are the custom properties `@trajs/shadcn/styles.css` defines. The
// swatches read them from the cascade rather than repeating their values, so a
// token that changes there shows up here without an edit to this file.
const tokens = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "sidebar",
  "sidebar-primary",
] as const;

export function Palette() {
  return (
    <div className="not-prose my-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {tokens.map((token) => (
        <div
          key={token}
          className="flex items-center gap-3 rounded-lg bg-background p-3 text-foreground ring-1 ring-border"
        >
          <div
            className="size-9 shrink-0 rounded-md ring-1 ring-border"
            style={{ background: `var(--${token})` }}
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{token}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {`var(--${token})`}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
