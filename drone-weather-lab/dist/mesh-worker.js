import { parseMesh } from "./mesh-import.js";
self.onmessage = ({ data }) => {
  try {
    const mesh = parseMesh(data.buffer, data.name);
    self.postMessage({ mesh }, [mesh.triangles.buffer, mesh.preview.buffer]);
  } catch (error) { self.postMessage({ error: error.message }); }
};
