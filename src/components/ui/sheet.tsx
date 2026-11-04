"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const MEDIUM = 0.58,
  LARGE = 0.94;
const SNAP_POINTS = [MEDIUM, LARGE];
const SheetState = React.createContext({
  fraction: MEDIUM,
  setFraction: (_value: number | string | null) => {},
  close: () => {},
  direction: "bottom" as "bottom" | "top" | "left" | "right",
});

function Sheet({
  open,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root> & { initialDetent?: "medium" | "large" }) {
  const [localOpen, setLocalOpen] = React.useState(defaultOpen);
  const isOpen = open ?? localOpen;
  const [opening, setOpening] = React.useState({ wasOpen: isOpen, cycle: 0 });
  if (opening.wasOpen !== isOpen)
    setOpening({ wasOpen: isOpen, cycle: opening.cycle + (isOpen ? 1 : 0) });
  const change = (next: boolean) => {
    setLocalOpen(next);
    onOpenChange?.(next);
  };
  // Vaul resets the snap point on a delayed close timer. A fresh instance on
  // reopening prevents that timer from collapsing a newly opened exercise.
  // Closing keeps the same instance so the exit animation can finish.
  return <SheetPanel key={opening.cycle} {...props} open={isOpen} onOpenChange={change} />;
}

function SheetPanel({
  open,
  initialDetent = "medium",
  direction = "bottom",
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root> & { initialDetent?: "medium" | "large" }) {
  const [fraction, setFraction] = React.useState<number | string | null>(
    initialDetent === "large" ? LARGE : MEDIUM,
  );
  return (
    <SheetState.Provider
      value={{
        fraction: typeof fraction === "number" ? fraction : MEDIUM,
        setFraction,
        close: () => props.onOpenChange?.(false),
        direction,
      }}
    >
      <DrawerPrimitive.Root
        {...props}
        open={open}
        direction={direction}
        snapPoints={SNAP_POINTS}
        fadeFromIndex={0}
        activeSnapPoint={fraction}
        setActiveSnapPoint={setFraction}
        shouldScaleBackground={false}
        handleOnly
        autoFocus
        snapToSequentialPoint
      >
        {children}
      </DrawerPrimitive.Root>
    </SheetState.Provider>
  );
}
const SheetPortal = DrawerPrimitive.Portal;
const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("bw-sheet-overlay fixed inset-0 z-50", className)}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> {
  side?: "bottom" | "top" | "left" | "right";
}
const SheetContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  SheetContentProps
>(({ side, className, children, onOpenAutoFocus, onCloseAutoFocus, style, ...props }, ref) => {
  const state = React.useContext(SheetState),
    opener = React.useRef<HTMLElement | null>(null);
  const dragStart = React.useRef(0),
    dragged = React.useRef(false);
  const actualSide = side ?? state.direction,
    expanded = state.fraction === LARGE;
  const toggle = () => state.setFraction(expanded ? MEDIUM : LARGE);
  return (
    <SheetPortal>
      <SheetOverlay />
      <DrawerPrimitive.Content
        ref={ref}
        className={cn("bw-sheet fixed z-50 text-card-foreground outline-none", className)}
        data-side={actualSide}
        data-panel-expanded={expanded}
        style={
          { ...style, "--bw-sheet-visible": `${state.fraction * 100}dvh` } as React.CSSProperties
        }
        {...props}
        onOpenAutoFocus={(event) => {
          opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          onOpenAutoFocus?.(event);
          if (!event.defaultPrevented) {
            event.preventDefault();
            if (event.target instanceof HTMLElement) event.target.focus({ preventScroll: true });
          }
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (!event.defaultPrevented) {
            event.preventDefault();
            const target = opener.current;
            requestAnimationFrame(() => {
              if (
                document.querySelector('.bw-sheet[data-state="open"],.bw-dialog[data-state="open"]')
              )
                return;
              if (target?.isConnected) target.focus({ preventScroll: true });
            });
          }
        }}
      >
        <div className="bw-sheet-toolbar">
          <button
            type="button"
            className="bw-sheet-collapse"
            aria-label={expanded ? "Zwiń panel do połowy" : "Zwiń panel"}
            onClick={() => (expanded ? state.setFraction(MEDIUM) : state.close())}
          >
            <ChevronDown size={18} aria-hidden="true" />
            <span>Zwiń</span>
          </button>
          <DrawerPrimitive.Handle
            className="bw-sheet-handle"
            preventCycle
            aria-hidden={false}
            role="button"
            tabIndex={0}
            aria-label={expanded ? "Zwiń panel do połowy uchwytem" : "Rozwiń panel"}
            aria-expanded={expanded}
            onPointerDownCapture={(event) => {
              dragStart.current = event.clientY;
              dragged.current = false;
            }}
            onPointerMoveCapture={(event) => {
              if (Math.abs(event.clientY - dragStart.current) > 8) dragged.current = true;
            }}
            onPointerUpCapture={(event) => {
              const delta = event.clientY - dragStart.current;
              // A deliberate slow drag should settle just like a quick swipe.
              if (delta > 100)
                requestAnimationFrame(() => (expanded ? state.setFraction(MEDIUM) : state.close()));
              else if (delta < -75) requestAnimationFrame(() => state.setFraction(LARGE));
            }}
            onClick={() => {
              if (!dragged.current) toggle();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggle();
              }
            }}
          />
          <DrawerPrimitive.Close className="bw-sheet-close" aria-label="Zamknij">
            <X size={18} aria-hidden="true" />
          </DrawerPrimitive.Close>
        </div>
        <div
          className="bw-sheet-scroll"
          data-vaul-no-drag=""
          onFocusCapture={(event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target.matches(
                'input:not([type="checkbox"]):not([type="radio"]),textarea,select',
              )
            )
              state.setFraction(LARGE);
          }}
        >
          {children}
        </div>
      </DrawerPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = "SheetContent";
const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      "bw-sheet-title text-lg font-semibold leading-tight tracking-[-.02em] text-foreground",
      className,
    )}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";
const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm leading-relaxed text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";
export { Sheet, SheetPortal, SheetOverlay, SheetContent, SheetTitle, SheetDescription };
