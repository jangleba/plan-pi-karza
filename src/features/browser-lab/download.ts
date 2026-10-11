export function downloadText(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Safari can read the download after the click handler has returned.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
