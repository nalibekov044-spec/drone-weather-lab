import { solveCFDGenerator } from "./cfd-core.js";
import { traceLines } from "./flow-lines.js";
let currentField = null, currentKey = "", currentConfig = null;
let resumeState = null, generation = 0, paused = false, active = null, timer = null;

function runChunk(task) {
  timer = null;
  if (task.generation !== generation || paused) return;
  try {
    const step = task.iterator.next();
    if (!step.done) {
      self.postMessage({ type: "progress", key: task.key, ...step.value });
      timer = setTimeout(() => runChunk(task), 0);
    } else {
      const field = step.value;
      resumeState = field._resume; delete field._resume;
      currentField = field; currentKey = task.key; currentConfig = task.config; active = null;
      self.postMessage({ type: "result", key: task.key, field });
    }
  } catch (error) {
    active = null; resumeState = null;
    self.postMessage({ type: "error", key: task.key, message: error.message });
  }
}

self.onmessage = ({ data }) => {
  const { key, config, type, trace } = data;
  if (type === "pause") { paused = true; clearTimeout(timer); timer = null; return; }
  if (type === "resume") { if (paused) { paused = false; if (active) timer = setTimeout(() => runChunk(active), 0); } return; }
  if (type === "cancel") { generation++; clearTimeout(timer); timer = null; active = null; return; }
  if (type === "trace") {
    if (currentField && key === currentKey) self.postMessage({ type: "lines", key, traceKey: trace.key, lines: traceLines(currentField, currentConfig, trace.count, trace.layer) });
    return;
  }
  const resume = type === "continue" && key === currentKey ? resumeState : null;
  generation++; clearTimeout(timer);
  if (!resume) { resumeState = null; currentField = null; currentKey = ""; }
  active = { generation, key, config, iterator: solveCFDGenerator(config, null, resume) };
  if (!paused) runChunk(active);
};
