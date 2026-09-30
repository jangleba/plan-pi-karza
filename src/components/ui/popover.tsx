import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, collisionPadding, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={
        collisionPadding ?? {
          top: 16,
          left: 4,
          right: 4,
          bottom:
            16 +
            (typeof document === "undefined"
              ? 0
              : parseFloat(
                  getComputedStyle(document.documentElement).getPropertyValue(
                    "--app-nav-clearance",
                  ),
                ) || 0),
        }
      }
      className={cn(
        "z-[70] w-[min(22rem,calc(100vw-2rem))] max-h-(--radix-popover-content-available-height) overflow-y-auto rounded-xl border bg-popover p-4 text-popover-foreground outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 origin-(--radix-popover-content-transform-origin)",
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
