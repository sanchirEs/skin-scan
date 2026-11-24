// MediaPipe Face Landmarker, loaded once from our own /public folder.
import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";

export class VisionLoadError extends Error {
  constructor(cause: unknown) {
    super("face model could not load");
    this.name = "VisionLoadError";
    this.cause = cause;
  }
}

let instance: Promise<FaceLandmarker> | null = null;
let lastTs = 0;

async function create(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  // One running mode for the live preview and the stills alike. Switching modes rebuilds the graph,
  // and on iPhones that second graph pushed in-app browsers (Messenger) over their memory limit:
  // the page went white right after the scan.
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate },
    runningMode: "VIDEO" as const,
    numFaces: 2,
    outputFacialTransformationMatrixes: true,
    outputFaceBlendshapes: false,
  });
  try {
    return await FaceLandmarker.createFromOptions(fileset, options("GPU"));
  } catch {
    return await FaceLandmarker.createFromOptions(fileset, options("CPU"));
  }
}

/** Resolves the shared landmarker (VIDEO running mode). */
export function loadLandmarker(): Promise<FaceLandmarker> {
  instance ??= create().catch((err) => {
    instance = null;
    throw new VisionLoadError(err);
  });
  return instance;
}

/** VIDEO mode needs strictly increasing timestamps, for live frames and stills alike. */
export function nextTimestamp(now = performance.now()): number {
  lastTs = Math.max(Math.round(now), lastTs + 1);
  return lastTs;
}

/** Landmarks of one still frame, through the same VIDEO-mode landmarker. */
export async function detectStill(source: ImageBitmap): Promise<FaceLandmarkerResult> {
  const lm = await loadLandmarker();
  return lm.detectForVideo(source, nextTimestamp());
}

/**
 * Frees the model (its graphics context and graph) once the photos are read. The quiz and the
 * report never need it, and a retake loads it again from the browser cache.
 */
export function releaseLandmarker(): void {
  const p = instance;
  instance = null;
  p?.then((lm) => lm.close()).catch(() => {});
}

/** Starts downloading the model early (e.g. on the tips screen). */
export function preloadLandmarker(): void {
  loadLandmarker().catch(() => {});
}
