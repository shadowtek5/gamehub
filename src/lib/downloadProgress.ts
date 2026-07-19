// Read a fetch Response body to a Buffer while reporting byte progress. Used by
// the art-picker download routes so a large image shows a real filling bar.
// Falls back to a single arrayBuffer() read (one final progress tick) when the
// body isn't a readable stream. Never used for streaming to the client — the
// buffer is transcoded/saved server-side as before.

import { safeFetch } from "./ssrfGuard";
import { startOpProgress, setOpProgress } from "./opProgress";

/** Download a remote image to a Buffer under op-progress `key`, reporting byte
 *  progress as it streams. Throws on HTTP error / empty body (the caller records
 *  the terminal state via finishOpProgress). The caller still transcodes/saves. */
export async function fetchImageWithProgress(
  url: string,
  key: string
): Promise<{ buf: Buffer; contentType: string }> {
  startOpProgress(key, "bytes");
  const res = await safeFetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
  const buf = await readBodyWithProgress(res, (bytes, total) =>
    setOpProgress(key, { phase: "downloading", unit: "bytes", done: bytes, total })
  );
  if (buf.length === 0) throw new Error("Empty image");
  return { buf, contentType: res.headers.get("content-type")?.split(";")[0].trim() ?? "" };
}

export async function readBodyWithProgress(
  res: Response,
  onProgress?: (bytes: number, total: number) => void
): Promise<Buffer> {
  const total = Number(res.headers.get("content-length")) || 0;
  const body = res.body;
  if (!body) {
    const buf = Buffer.from(await res.arrayBuffer());
    onProgress?.(buf.length, total || buf.length);
    return buf;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length) {
      chunks.push(value);
      bytes += value.length;
      onProgress?.(bytes, total);
    }
  }
  return Buffer.concat(chunks);
}
