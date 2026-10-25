import { detectPose } from "./pose";
self.addEventListener("message", async (event: MessageEvent<ImageBitmap>) => {
  try {
    self.postMessage({ pose: await detectPose(event.data) });
  } catch (reason) {
    self.postMessage({
      error: reason instanceof Error ? reason.message : "Analiza jest niedostępna.",
    });
  } finally {
    event.data.close();
  }
});
