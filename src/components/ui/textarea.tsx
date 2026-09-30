import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-28 w-full rounded-lg border border-[var(--bw-control-border)] bg-[var(--bw-control-fill)] px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:border-[var(--bw-control-focus-border)] focus-visible:bg-[var(--bw-control-focus-fill)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
