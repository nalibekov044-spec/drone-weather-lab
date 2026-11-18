import { parseMesh, meshAerodynamics } from "./mesh-import.js";
self.onmessage = ({ data }) => {
  try {
    if (data.type === "analyze") { self.postMessage({ aerodynamics: meshAerodynamics(data.triangles) }); return; }
    const mesh = parseMesh(data.buffer, data.name);
    self.postMessage({ mesh }, [mesh.triangles.buffer, mesh.preview.buffer]);
  } catch (error) { self.postMessage({ error: error.message }); }
};
