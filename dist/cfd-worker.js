import { solveCFD } from "./cfd-core.js";
import { traceLines } from "./flow-lines.js";
let currentField = null, currentKey = "", currentConfig = null;

self.onmessage = event => {
  const { key, config, type, trace } = event.data;
  try {
    if (type === "trace") {
      if (currentField && key === currentKey) self.postMessage({ type: "lines", key, traceKey: trace.key, lines: traceLines(currentField, currentConfig, trace.count, trace.layer) });
      return;
    }
    const field = solveCFD(config, progress => self.postMessage({ type: "progress", key, progress }));
    currentField = field; currentKey = key; currentConfig = config;
    // Retain the field in the worker so dense line integration stays off the UI thread.
    self.postMessage({ type: "result", key, field });
  } catch (error) {
    self.postMessage({ type: "error", key, message: error instanceof Error ? error.message : String(error) });
  }
};
