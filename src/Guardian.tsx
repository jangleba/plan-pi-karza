import { useEffect, useState } from "react";
import { DraftBanner, LegalDoc } from "./legal/LegalUi";
import { guardianConfirm, guardianInfo, guardianRevoke } from "./legal/guardianFn";

/**
 * Strona dla opiekuna (bez logowania; wymaga jednorazowego tokenu z linku). Opiekun widzi tylko wersję warunków – bez danych o osobie.
 * Potwierdzenie dotyczy WYŁĄCZNIE warunków umowy; nie jest zgodą na przetwarzanie danych. To deklaracja, a nie weryfikacja tożsamości.
 */
export function GuardianPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [info, setInfo] = useState<{ valid: boolean; contractVersion?: string; expiresAt?: string } | null | undefined>(undefined);
  const [attest, setAttest] = useState(false);
  const [done, setDone] = useState<{ revokeToken: string } | null>(null);
  const [err, setErr] = useState("");
  const [revoked, setRevoked] = useState(false);
  useEffect(() => { if (token) void guardianInfo(token).then(setInfo); else setInfo(null); }, [token]);

  if (info === undefined) return null;
  return (
    <main className="mx-auto max-w-md px-5 pb-16 pt-16">
      <h1 className="text-[26px] font-semibold tracking-tight">Potwierdzenie przez opiekuna</h1>
      {(!info || !info.valid) && !done ? (
        <p className="mt-4 rounded-2xl bg-pink px-4 py-3 text-sm text-pink-ink">Ten link jest nieprawidłowy, wygasł albo został już wykorzystany. Poproś osobę, której dotyczy umowa, o wygenerowanie nowego.</p>
      ) : done ? (
        <div className="mt-4">
          <p className="mb-3 rounded-2xl bg-mint px-4 py-3 text-sm text-mint-ink">Potwierdzenie zapisane. Dziękujemy.</p>
          <p className="mb-2 text-sm">Aby je później <b>cofnąć</b>, zachowaj poniższy link (pokazujemy go tylko teraz):</p>
          <p className="break-all rounded-2xl bg-canvas p-3 font-mono text-xs">{`${location.origin}/guardian?revoke=${done.revokeToken}`}</p>
          {revoked && <p className="mt-3 text-sm">Potwierdzenie cofnięte.</p>}
        </div>
      ) : (
        <>
          <p className="mb-3 mt-2 text-sm text-ink/80">Osoba w wieku 16–17 lat chce zawrzeć umowę (np. płatną subskrypcję) w aplikacji Ballwise. Zapoznaj się z warunkami, wersja <b>{info?.contractVersion}</b>.</p>
          <DraftBanner />
          <div className="mb-4 max-h-72 overflow-y-auto rounded-2xl border border-hairline p-4"><LegalDoc kind="terms" /></div>
          <label className="mb-3 flex gap-3 rounded-2xl border border-hairline bg-card p-4 text-sm"><input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5" />
            <span>Oświadczam, że jestem przedstawicielem ustawowym (rodzicem lub opiekunem) tej osoby i potwierdzam warunki umowy w wersji {info?.contractVersion}.</span></label>
          <p className="mb-4 text-xs text-muted">To potwierdzenie dotyczy wyłącznie warunków umowy. Nie jest zgodą na przetwarzanie danych ani weryfikacją tożsamości. Nie zbieramy Twoich danych osobowych.</p>
          {err && <p className="mb-3 rounded-2xl bg-pink px-4 py-3 text-sm text-pink-ink">{err}</p>}
          <button disabled={!attest} onClick={async () => { const r = await guardianConfirm(token, info!.contractVersion!); if (r.ok) setDone({ revokeToken: r.revokeToken }); else setErr(r.error); }} className="bw-grad w-full rounded-2xl py-4 text-base font-medium disabled:opacity-40">Potwierdzam</button>
        </>
      )}
      <RevokeBox onRevoked={() => setRevoked(true)} />
    </main>
  );
}

function RevokeBox({ onRevoked }: { onRevoked: () => void }) {
  const t = new URLSearchParams(window.location.search).get("revoke");
  const [state, setState] = useState<"" | "ok" | "fail">("");
  if (!t) return null;
  return (
    <div className="mt-4 rounded-2xl border border-hairline p-4 text-sm">
      <p className="mb-2">Cofnięcie wcześniejszego potwierdzenia.</p>
      {state === "" && <button className="rounded-xl bg-pink px-4 py-2.5 font-semibold text-pink-ink" onClick={async () => { const ok = await guardianRevoke(t); setState(ok ? "ok" : "fail"); if (ok) onRevoked(); }}>Cofnij potwierdzenie</button>}
      {state === "ok" && <p>Potwierdzenie cofnięte.</p>}
      {state === "fail" && <p>Nie udało się cofnąć – link jest nieprawidłowy albo potwierdzenie było już cofnięte.</p>}
    </div>
  );
}
