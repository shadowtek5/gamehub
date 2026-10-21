// Client helper: uploads one BIOS / firmware file to PUT /api/firmware/upload as the
// raw body (streamed by the server, so 300 MB+ firmware packages are fine), with progress.

export interface FirmwareUploadResult {
  ok: boolean;
  error?: string;
  /** a BIOS pack .zip: what was filed from inside it */
  zip?: boolean;
  imported?: { name: string; slug: string; filename: string; verified: boolean }[];
  alreadyVerified?: string[];
  skipped?: string[];
  outcome?:
    | { status: "bios"; slug: string; filename: string; verified: boolean }
    | { status: "package"; slug: string; filename: string; packageId: string }
    | { status: "already"; slug: string; filename: string };
}

export function uploadFirmwareFile(
  file: File,
  slug: string,
  onProgress?: (percent: number) => void
): Promise<FirmwareUploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const q = new URLSearchParams({ name: file.name });
    if (slug) q.set("platform", slug);
    xhr.open("PUT", `/api/firmware/upload?${q}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: FirmwareUploadResult;
      try {
        data = JSON.parse(xhr.responseText) as FirmwareUploadResult;
      } catch {
        data = { ok: false, error: `HTTP ${xhr.status}` };
      }
      resolve(xhr.status >= 200 && xhr.status < 300 ? { ...data, ok: data.ok !== false } : { ...data, ok: false });
    };
    xhr.onerror = () => resolve({ ok: false, error: "Network error" });
    xhr.send(file);
  });
}
