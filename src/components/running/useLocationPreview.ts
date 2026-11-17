import { useCallback, useEffect, useRef, useState } from "react";
import type { RoutePoint } from "@/lib/running/types";

/**
 * Position shown on the map before a run starts. It uses a single position request and keeps
 * nothing: no watch, no stored route, no training record. Opening the map never starts a run.
 * Where the Permissions API says the permission is already granted the position is fetched on
 * its own; otherwise the player asks for it with "Włącz lokalizację".
 */
export type LocationStatus =
  | "checking"
  | "needs_consent"
  | "locating"
  | "ready"
  | "denied"
  | "timeout"
  | "unavailable"
  | "unsupported";

export const LOCATION_TIMEOUT_MS = 15_000;
/** Beyond this accuracy a position is only orientation, not a measurement. */
export const GOOD_ACCURACY_M = 35;

export function locationErrorStatus(error: unknown): LocationStatus {
  const code = (error as { code?: number } | null)?.code;
  if (code === 1) return "denied";
  if (code === 2) return "unavailable";
  if (code === 3) return "timeout";
  return "unavailable";
}

export function useLocationPreview(enabled: boolean) {
  const [status, setStatus] = useState<LocationStatus>("checking");
  const [point, setPoint] = useState<RoutePoint | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  const request = useCallback(() => {
    if (inFlight.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }
    inFlight.current = true;
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        inFlight.current = false;
        if (!mounted.current) return;
        setPoint({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          recordedAt: new Date(position.timestamp || Date.now()).toISOString(),
          elapsedSec: 0,
          accuracyM: position.coords.accuracy,
          segment: 0,
        });
        setStatus("ready");
      },
      (error) => {
        inFlight.current = false;
        if (mounted.current) setStatus(locationErrorStatus(error));
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: LOCATION_TIMEOUT_MS },
    );
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }
    let cancelled = false;
    let permission: PermissionStatus | null = null;
    const apply = (state: PermissionState) => {
      if (cancelled) return;
      if (state === "denied") setStatus("denied");
      else if (state === "granted") request();
      else setStatus((current) => (current === "ready" ? current : "needs_consent"));
    };
    const query = navigator.permissions?.query?.({ name: "geolocation" as PermissionName });
    if (!query) setStatus("needs_consent");
    else
      void query
        .then((result) => {
          if (cancelled) return;
          permission = result;
          apply(result.state);
          result.onchange = () => apply(result.state);
        })
        .catch(() => !cancelled && setStatus("needs_consent"));
    return () => {
      cancelled = true;
      if (permission) permission.onchange = null;
    };
  }, [enabled, request]);

  return { status, point, request, busy: status === "locating" || status === "checking" };
}

export function locationStatusText(status: LocationStatus, accuracyM?: number): string {
  switch (status) {
    case "checking":
      return "Sprawdzam dostęp do lokalizacji…";
    case "needs_consent":
      return "Włącz lokalizację, aby zobaczyć pozycję na mapie. Otwarcie mapy nie rozpoczyna treningu ani zapisu trasy.";
    case "locating":
      return "Ustalam pozycję GPS…";
    case "ready":
      return accuracyM !== undefined && accuracyM > GOOD_ACCURACY_M
        ? `Pozycja orientacyjna (±${Math.round(accuracyM)} m). Wyjdź na otwartą przestrzeń, żeby poprawić sygnał.`
        : `Pozycja gotowa${accuracyM !== undefined ? ` (±${Math.round(accuracyM)} m)` : ""}.`;
    case "denied":
      return "Lokalizacja jest wyłączona dla BallWise. Włącz ją w ustawieniach telefonu lub przeglądarki albo wybierz bieg bez GPS.";
    case "timeout":
      return "GPS nie odpowiedział na czas. Wyjdź na otwartą przestrzeń i spróbuj ponownie.";
    case "unavailable":
      return "Telefon nie może teraz ustalić pozycji. Spróbuj na otwartej przestrzeni.";
    case "unsupported":
      return "Ta przeglądarka nie udostępnia lokalizacji. Wybierz bieg bez GPS: czas i prowadzenie działają tak samo.";
  }
}
