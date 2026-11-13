import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The bottom action area of the open exercise; cards send their main button there. */
export const DockSlot = createContext<HTMLElement | null>(null);

/** Renders its children in the exercise's bottom action area when there is one. */
export function Docked({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const slot = useContext(DockSlot);
  return enabled && slot ? createPortal(children, slot) : <>{children}</>;
}
