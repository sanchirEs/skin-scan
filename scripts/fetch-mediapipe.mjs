// Copies MediaPipe's wasm runtime into /public and downloads the face model once.
// Both are served from our own site so the camera page never calls a third-party CDN.
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const outDir = join(root, "public", "mediapipe");
const wasmOut = join(outDir, "wasm");
const modelOut = join(outDir, "face_landmarker.task");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

mkdirSync(wasmOut, { recursive: true });
for (const file of readdirSync(wasmSrc)) {
  copyFileSync(join(wasmSrc, file), join(wasmOut, file));
}
console.log(`copied wasm runtime to ${wasmOut}`);

if (existsSync(modelOut) && statSync(modelOut).size > 1_000_000) {
  console.log("face model already present");
} else {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`model download failed: ${res.status}`);
  writeFileSync(modelOut, Buffer.from(await res.arrayBuffer()));
  console.log(`downloaded face model (${statSync(modelOut).size} bytes)`);
}
