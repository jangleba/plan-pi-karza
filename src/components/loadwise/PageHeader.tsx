import type { ReactNode } from "react";
import { SurfaceSketch, type SketchKind } from "@/components/design/SurfaceSketch";

/** Shared page hierarchy. Authentication and actions stay with the caller. */
export function PageHeader({
  title,
  subtitle,
  actions,
  brand = false,
  sketch,
  className = "",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  brand?: boolean;
  sketch?: SketchKind;
  className?: string;
}) {
  return (
    <header className={`bw-page-header ${sketch ? "bw-sketch-surface" : ""} ${className}`}>
      {sketch && <SurfaceSketch kind={sketch} />}
      <div className="bw-page-heading">
        <div className="bw-page-heading-copy">
          {brand && (
            <span className="bw-wordmark" aria-label="BallWise">
              BallWise
            </span>
          )}
          <h1>{title}</h1>
        </div>
        {actions && <div className="bw-page-actions">{actions}</div>}
      </div>
      {subtitle && <p className="bw-page-subtitle">{subtitle}</p>}
    </header>
  );
}
