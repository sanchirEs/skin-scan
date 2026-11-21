// MediaPipe Face Landmarker, loaded once from our own /public folder.
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export class VisionLoadError extends Error {
  constructor(cause: unknown) {
    super("face model could not load");
    this.name = "VisionLoadError";
    this.cause = cause;
  }
}

type Mode = "VIDEO" | "IMAGE";
let instance: Promise<FaceLandmarker> | null = null;
let currentMode: Mode = "VIDEO";

async function create(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate },
    runningMode: "VIDEO" as Mode,
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

/** Resolves the shared landmarker in the requested running mode. */
export async function loadLandmarker(mode: Mode): Promise<FaceLandmarker> {
  if (!instance) {
    instance = create().catch((err) => {
      instance = null;
      throw new VisionLoadError(err);
    });
    currentMode = "VIDEO";
  }
  const lm = await instance;
  if (mode !== currentMode) {
    await lm.setOptions({ runningMode: mode });
    currentMode = mode;
  }
  return lm;
}

/** Starts downloading the model early (e.g. on the tips screen). */
export function preloadLandmarker(): void {
  loadLandmarker("VIDEO").catch(() => {});
}
