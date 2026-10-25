import { parseJumpVideo } from "./videoParser";
self.addEventListener("message", (event: MessageEvent<ArrayBuffer>) => {
  try {
    const video = parseJumpVideo(event.data);
    const buffers = new Set<ArrayBuffer>(video.samples.map((sample) => sample.data.buffer));
    const description = video.config.description;
    if (description instanceof ArrayBuffer) buffers.add(description);
    else if (ArrayBuffer.isView(description) && description.buffer instanceof ArrayBuffer)
      buffers.add(description.buffer);
    self.postMessage({ video }, { transfer: [...buffers] });
  } catch (reason) {
    self.postMessage({
      error: reason instanceof Error ? reason.message : "Nie można odczytać filmu.",
    });
  }
});
