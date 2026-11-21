/** Wysyła tekst przez systemowe „Udostępnij” (gdy jest), a w przeciwnym razie kopiuje go do schowka. */
export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* spróbuj starszym sposobem */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

export async function shareOrCopy(text: string, title?: string): Promise<ShareResult> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try { await navigator.share({ text, title }); return "shared"; }
    catch (e) { if ((e as { name?: string })?.name === "AbortError") return "cancelled"; /* inaczej spróbuj kopiowania */ }
  }
  return (await copyText(text)) ? "copied" : "failed";
}
