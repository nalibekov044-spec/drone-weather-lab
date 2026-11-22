import { parseMeshAsync, meshAerodynamics } from "./mesh-import.js";
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "analyze") { self.postMessage({ aerodynamics: meshAerodynamics(data.triangles) }); return; }
    const mesh = await parseMeshAsync(data.buffer, data.name);
    self.postMessage({ mesh }, [mesh.triangles.buffer, mesh.preview.buffer]);
  } catch (error) { self.postMessage({ error: error.message }); }
};
