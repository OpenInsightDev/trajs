import { Button } from "@trajs/ui-shadcn/button";

const variants = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const;

const sizes = ["xs", "sm", "default", "lg"] as const;

/** Every button variant at every size, which is the comparison the page is for. */
export function ButtonVariants() {
  return (
    <div className="flex flex-col gap-4">
      {variants.map((variant) => (
        <div key={variant} className="flex flex-wrap items-center gap-3">
          <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{variant}</span>
          {sizes.map((size) => (
            <Button key={size} variant={variant} size={size}>
              Button
            </Button>
          ))}
          <Button variant={variant} disabled>
            Disabled
          </Button>
        </div>
      ))}
    </div>
  );
}
