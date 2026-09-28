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

export async function detectBarcodeFromImage(file: File): Promise<string | null> {
  const detectorConstructor = (
    window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }
  ).BarcodeDetector;
  if (!detectorConstructor) {
    throw new Error(
      "Na tym urządzeniu skan kodu w przeglądarce nie jest dostępny. Powiedz albo wpisz nazwę produktu.",
    );
  }
  const supported = detectorConstructor.getSupportedFormats
    ? await detectorConstructor.getSupportedFormats()
    : ["ean_13", "ean_8", "upc_a", "upc_e"];
  const formats = ["ean_13", "ean_8", "upc_a", "upc_e"].filter((format) =>
    supported.includes(format),
  );
  const detector = new detectorConstructor(formats.length > 0 ? { formats } : undefined);
  const bitmap = await createImageBitmap(file);
  try {
    const detections = await detector.detect(bitmap);
    const value =
      detections.find((detection) => detection.rawValue)?.rawValue?.replace(/\D/g, "") ?? null;
    return value && value.length >= 8 ? value : null;
  } finally {
    bitmap.close();
  }
}
