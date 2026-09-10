import { solveCFD } from "./cfd-core.js";

self.onmessage = event => {
  const { key, config } = event.data;
  try {
    const field = solveCFD(config, progress => self.postMessage({ type: "progress", key, progress }));
    self.postMessage({ type: "result", key, field }, [
      field.velocityX.buffer,
      field.velocityY.buffer,
      field.velocityZ.buffer,
      field.pressure.buffer,
      field.vorticity.buffer,
      field.solid.buffer
    ]);
  } catch (error) {
    self.postMessage({ type: "error", key, message: error instanceof Error ? error.message : String(error) });
  }
};
