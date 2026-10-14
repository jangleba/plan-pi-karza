interface BarcodeDetection {
  rawValue?: string;
}
interface BarcodeDetectorInstance {
  detect(source: ImageBitmapSource): Promise<BarcodeDetection[]>;
}
interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
}
export function validProductBarcode(raw: string): boolean {
  const code = raw.replace(/\s/g, "");
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  let sum = 0;
  for (let i = code.length - 2, position = 0; i >= 0; i--, position++)
    sum += Number(code[i]) * (position % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(code.at(-1));
}
/** One-shot local decode; no camera stream or background scan stays active. */
export async function detectBarcodeFromImage(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024)
    throw new Error("Wybierz zdjęcie kodu do 20 MB albo wpisz cyfry ręcznie.");
  const Constructor = (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
  if (Constructor && typeof createImageBitmap === "function") {
    try {
      const supported = Constructor.getSupportedFormats
        ? await Constructor.getSupportedFormats()
        : ["ean_13", "ean_8", "upc_a"];
      const formats = ["ean_13", "ean_8", "upc_a"].filter((f) => supported.includes(f));
      if (formats.length) {
        const bitmap = await createImageBitmap(file);
        try {
          const detections = await new Constructor({ formats }).detect(bitmap);
          const code = detections.map((d) => d.rawValue ?? "").find(validProductBarcode);
          if (code) return code;
        } finally {
          bitmap.close();
        }
      }
    } catch {
      /* Safari and unsupported native detectors use the bundled fallback. */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("Nie można odczytać zdjęcia kodu. Wybierz inne zdjęcie lub wpisz cyfry.");
    }
    const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Odczyt zdjęcia niedostępny. Wpisz kod ręcznie.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { decodeBarcodeCanvas } = await import("./vendor/barcodeDecoder.js");
    try {
      const code = decodeBarcodeCanvas(canvas).replace(/\s/g, "");
      return validProductBarcode(code) ? code : null;
    } catch {
      return null;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
