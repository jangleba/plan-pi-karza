import type { ReactNode, ButtonHTMLAttributes } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function LabButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`bl-button ${className}`} {...props} />;
}
export function LabNotice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={error ? "bl-notice bl-error" : "bl-notice"} role={error ? "alert" : "status"}>
      {children}
    </div>
  );
}
export function LabConfirm({
  open,
  title,
  description,
  action,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onCancel();
      }}
    >
      <DialogContent className="max-w-[calc(100vw-32px)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border px-4 py-3 text-sm">
            Wróć
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-destructive px-4 py-3 text-sm text-destructive-foreground"
          >
            {action}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Nie udało się wykonać tej operacji. Spróbuj ponownie.";
