import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactNode,
  type ReactElement,
} from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";

export function Field({
  label,
  htmlFor,
  help,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  help?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  const labelId = `${id}-label`;
  function associate(nodes: ReactNode, direct = true): ReactNode {
    if (Array.isArray(nodes))
      return Children.toArray(nodes).map((child) => associate(child, direct));
    if (!isValidElement(nodes)) return nodes;
    const element = nodes as ReactElement<Record<string, unknown>>;
    const props = element.props;
    const isControl = htmlFor ? props.id === htmlFor : direct;
    return cloneElement(element, {
      ...(isControl
        ? {
            "aria-describedby":
              [props["aria-describedby"], (error || help) && messageId].filter(Boolean).join(" ") ||
              undefined,
            "aria-invalid": error ? true : props["aria-invalid"],
            ...(!htmlFor ? { "aria-labelledby": props["aria-labelledby"] ?? labelId } : {}),
          }
        : {}),
      ...(props.children ? { children: associate(props.children as ReactNode, false) } : {}),
    });
  }
  return (
    <div className={cn("bw-field", className)}>
      <label id={labelId} htmlFor={htmlFor} className="bw-field-label">
        {label}
      </label>
      {associate(children)}
      {error ? (
        <p id={messageId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : help ? (
        <p id={messageId} className="text-sm text-muted-foreground">
          {help}
        </p>
      ) : null}
    </div>
  );
}

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};
export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  selectedClassName,
}: {
  label: string;
  value: T | null;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  selectedClassName?: string;
}) {
  const id = useId();
  return (
    <fieldset className={cn("bw-field", className)}>
      <legend className="bw-field-label mb-2">{label}</legend>
      <div className="bw-choice-list">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "bw-choice",
              value === option.value && (selectedClassName ?? "is-selected"),
              option.disabled && "opacity-50",
            )}
          >
            <input
              type="radio"
              name={id}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span>
              <span className="font-medium">{option.label}</span>
              {option.description && (
                <span className="mt-1 block text-sm text-muted-foreground">
                  {option.description}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  panelId,
}: {
  value: T;
  options: readonly { value: T; label: string; disabled?: boolean; ariaLabel?: string }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
  panelId?: string;
}) {
  const id = useId();
  return (
    <div className={cn("bw-tabs", className)} role="tablist" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          id={`${id}-${option.value}`}
          aria-label={option.ariaLabel}
          aria-selected={value === option.value}
          aria-controls={panelId}
          disabled={option.disabled}
          tabIndex={value === option.value ? 0 : -1}
          className={cn("bw-tab", value === option.value && "is-selected")}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const available = options
              .map((item, i) => ({ ...item, index: i }))
              .filter((item) => !item.disabled);
            const current = available.findIndex((item) => item.index === index);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? available.length - 1
                  : (current + (event.key === "ArrowRight" ? 1 : -1) + available.length) %
                    available.length;
            const target = available[next];
            if (target) {
              onChange(target.value);
              document.getElementById(`${id}-${target.value}`)?.focus();
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ActionRow({
  title,
  description,
  icon,
  trailing,
  onClick,
  children,
  className,
  disabled,
  reserveIcon = Boolean(icon),
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  reserveIcon?: boolean;
}) {
  const content = (
    <>
      {reserveIcon && (
        <span className="bw-row-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        {description && (
          <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
        )}
        {children}
      </span>
      <span className="bw-row-action">
        {trailing ?? (onClick ? <ChevronRight className="size-5" aria-hidden="true" /> : null)}
      </span>
    </>
  );
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("bw-action-row disabled:opacity-50", reserveIcon && "has-icon", className)}
    >
      {content}
    </button>
  ) : (
    <div className={cn("bw-action-row", reserveIcon && "has-icon", className)}>{content}</div>
  );
}

export function MetricGroup({
  items,
  className,
}: {
  items: readonly { label: string; value: ReactNode; unit?: string; detail?: ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn("bw-metrics", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="bw-metric-value">
            {item.value}
            {item.unit && <span className="ml-1 text-base font-normal">{item.unit}</span>}
          </dd>
          {item.detail && <dd className="mt-1 text-sm text-muted-foreground">{item.detail}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function StatusMessage({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "error" | "success";
  className?: string;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "text-sm leading-relaxed",
        tone === "error"
          ? "text-destructive"
          : tone === "success"
            ? "text-primary"
            : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function Disclosure({
  title,
  children,
  className,
  open,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  open?: boolean;
}) {
  return (
    <details className={cn("bw-disclosure", className)} open={open}>
      <summary>{title}</summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  dismissible = true,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
  className?: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (dismissible || next) onOpenChange(next);
      }}
    >
      <DialogContent
        showClose={dismissible}
        className={className}
        {...(!description ? { "aria-describedby": undefined } : {})}
        onEscapeKeyDown={(event) => {
          if (!dismissible) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (!dismissible) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children && <div className="bw-dialog-body">{children}</div>}
        {footer && <div className="bw-dialog-actions">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "Potwierdź",
  busy = false,
  destructive = false,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
  busy?: boolean;
  destructive?: boolean;
  error?: string | null;
}) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      dismissible={!busy}
      footer={
        <>
          <Button autoFocus variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Zapisywanie…" : confirmLabel}
          </Button>
        </>
      }
    >
      {error && <StatusMessage tone="error">{error}</StatusMessage>}
    </ResponsiveDialog>
  );
}
