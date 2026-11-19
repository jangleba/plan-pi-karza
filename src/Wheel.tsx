import { useEffect, useRef } from "react";

const ITEM = 36;

/** Koło wyboru jak w iOS: przewijasz, środkowa wartość jest wybrana. */
export function Wheel<T extends number>({ values, value, onChange, format, label }: {
  values: T[]; value: T; onChange: (v: T) => void; format?: (v: T) => string; label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const i = Math.max(0, values.indexOf(value));
    if (ref.current) ref.current.scrollTop = i * ITEM;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
      if (values[i] !== value) { onChange(values[i]!); navigator.vibrate?.(5); }
    }, 60);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="mb-1 text-xs text-muted">{label}</div>
      <div className="relative w-full">
        <div className="pointer-events-none absolute inset-x-0 top-[36px] h-9 rounded-xl bw-sel" />
        <div ref={ref} onScroll={onScroll} aria-label={label}
          className="bw-wheel relative h-[108px] snap-y snap-mandatory overflow-y-scroll py-[36px] text-center">
          {values.map((v) => (
            <button key={v} type="button"
              onClick={() => { ref.current?.scrollTo({ top: values.indexOf(v) * ITEM, behavior: "smooth" }); }}
              className={`block h-9 w-full snap-center text-lg tabular-nums transition ${v === value ? "font-semibold text-accent" : "text-muted"}`}>
              {format ? format(v) : v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
