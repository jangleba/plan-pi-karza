export function downloadText(
  name: string,
  text: string,
  type = "application/json",
) {
  downloadBlob(name, new Blob([text], { type }));
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Safari can read the download after the click handler has returned.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
