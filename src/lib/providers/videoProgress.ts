// In-memory progress for per-game video snap fetches, polled by the UI.

export interface VideoFetchProgress {
  phase: "searching" | "downloading";
  bytes: number;
  total: number;
}

const globalProgress = globalThis as unknown as {
  __videoFetch?: Map<number, VideoFetchProgress>;
};

function store(): Map<number, VideoFetchProgress> {
  if (!globalProgress.__videoFetch) globalProgress.__videoFetch = new Map();
  return globalProgress.__videoFetch;
}

export function setVideoProgress(romId: number, progress: VideoFetchProgress | null) {
  if (progress) store().set(romId, progress);
  else store().delete(romId);
}

export function getVideoProgress(romId: number): VideoFetchProgress | null {
  return store().get(romId) ?? null;
}
