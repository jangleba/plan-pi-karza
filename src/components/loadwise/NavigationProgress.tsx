import { useRouterState } from "@tanstack/react-router";

/** Immediate acknowledgement while a destination's code is still arriving. */
export function NavigationProgress() {
  const pending = useRouterState({
    select: (state) =>
      Boolean(
        state.isLoading &&
        state.resolvedLocation &&
        state.location.href !== state.resolvedLocation.href,
      ),
  });
  return pending ? (
    <div className="bw-navigation-progress" role="status" aria-label="Otwieranie ekranu" />
  ) : null;
}
