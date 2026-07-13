// Client-side ROM patching: IPS, UPS, and BPS — the three formats that cover
// nearly every translation/hack. Pure functions over Uint8Array; runs in the
// browser so the server never touches ROM files.

export interface PatchResult {
  data: Uint8Array;
  warnings: string[];
}

function ascii(bytes: Uint8Array, start: number, len: number): string {
  return String.fromCharCode(...bytes.slice(start, start + len));
}

// ---------------- IPS ----------------

function applyIps(rom: Uint8Array, patch: Uint8Array): PatchResult {
  if (ascii(patch, 0, 5) !== "PATCH") throw new Error("Not an IPS patch (bad header)");
  const warnings: string[] = [];
  let out = new Uint8Array(rom); // grows as records land past the end
  let pos = 5;

  const grow = (needed: number) => {
    if (needed <= out.length) return;
    const bigger = new Uint8Array(needed);
    bigger.set(out);
    out = bigger;
  };

  for (;;) {
    if (pos + 3 > patch.length) throw new Error("Truncated IPS patch");
    if (ascii(patch, pos, 3) === "EOF" && pos + 3 >= patch.length - 3) {
      pos += 3;
      break;
    }
    const offset = (patch[pos] << 16) | (patch[pos + 1] << 8) | patch[pos + 2];
    const size = (patch[pos + 3] << 8) | patch[pos + 4];
    pos += 5;
    if (size === 0) {
      // RLE record
      const rleSize = (patch[pos] << 8) | patch[pos + 1];
      const value = patch[pos + 2];
      pos += 3;
      grow(offset + rleSize);
      out.fill(value, offset, offset + rleSize);
    } else {
      grow(offset + size);
      out.set(patch.slice(pos, pos + size), offset);
      pos += size;
    }
  }
  // Optional truncation extension
  if (pos + 3 <= patch.length) {
    const truncate = (patch[pos] << 16) | (patch[pos + 1] << 8) | patch[pos + 2];
    if (truncate > 0 && truncate < out.length) out = out.slice(0, truncate);
  }
  return { data: out, warnings };
}

// ---------------- shared: CRC32 + variable-length numbers ----------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint32LE(bytes: Uint8Array, pos: number): number {
  return (
    (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)) >>> 0
  );
}

class Reader {
  pos: number;
  constructor(
    public bytes: Uint8Array,
    start: number
  ) {
    this.pos = start;
  }
  /** beat-style variable-length number (used by both UPS and BPS) */
  vlq(): number {
    let data = 0;
    let shift = 1;
    for (;;) {
      const x = this.bytes[this.pos++];
      data += (x & 0x7f) * shift;
      if (x & 0x80) break;
      shift <<= 7;
      data += shift;
    }
    return data;
  }
}

// ---------------- UPS ----------------

function applyUps(rom: Uint8Array, patch: Uint8Array): PatchResult {
  if (ascii(patch, 0, 4) !== "UPS1") throw new Error("Not a UPS patch (bad header)");
  const warnings: string[] = [];
  const r = new Reader(patch, 4);
  const inputSize = r.vlq();
  const outputSize = r.vlq();

  const expectedInputCrc = readUint32LE(patch, patch.length - 12);
  if (rom.length !== inputSize) {
    warnings.push(
      `Source size differs (patch expects ${inputSize.toLocaleString()} bytes, ROM is ${rom.length.toLocaleString()}) — output may be wrong`
    );
  } else if (crc32(rom) !== expectedInputCrc) {
    warnings.push("Source CRC doesn't match — this patch was made for a different dump");
  }

  const out = new Uint8Array(outputSize);
  out.set(rom.slice(0, Math.min(rom.length, outputSize)));
  let offset = 0;
  const patchEnd = patch.length - 12;
  while (r.pos < patchEnd) {
    offset += r.vlq();
    while (r.pos < patchEnd) {
      const b = patch[r.pos++];
      if (b === 0) break;
      if (offset < outputSize) out[offset] = (offset < rom.length ? rom[offset] : 0) ^ b;
      offset++;
    }
    offset++;
  }

  const expectedOutputCrc = readUint32LE(patch, patch.length - 8);
  if (crc32(out) !== expectedOutputCrc) {
    warnings.push("Patched output CRC doesn't match the patch's expectation");
  }
  return { data: out, warnings };
}

// ---------------- BPS ----------------

function applyBps(rom: Uint8Array, patch: Uint8Array): PatchResult {
  if (ascii(patch, 0, 4) !== "BPS1") throw new Error("Not a BPS patch (bad header)");
  const warnings: string[] = [];
  const r = new Reader(patch, 4);
  const sourceSize = r.vlq();
  const targetSize = r.vlq();
  const metadataSize = r.vlq();
  r.pos += metadataSize;

  const expectedSourceCrc = readUint32LE(patch, patch.length - 12);
  if (rom.length !== sourceSize) {
    warnings.push(
      `Source size differs (patch expects ${sourceSize.toLocaleString()} bytes, ROM is ${rom.length.toLocaleString()}) — output may be wrong`
    );
  } else if (crc32(rom) !== expectedSourceCrc) {
    warnings.push("Source CRC doesn't match — this patch was made for a different dump");
  }

  const out = new Uint8Array(targetSize);
  let outputOffset = 0;
  let sourceRelative = 0;
  let targetRelative = 0;
  const patchEnd = patch.length - 12;

  while (r.pos < patchEnd) {
    const data = r.vlq();
    const action = data & 3;
    let length = (data >> 2) + 1;
    if (action === 0) {
      // SourceRead
      while (length--) {
        out[outputOffset] = rom[outputOffset] ?? 0;
        outputOffset++;
      }
    } else if (action === 1) {
      // TargetRead
      while (length--) out[outputOffset++] = patch[r.pos++];
    } else if (action === 2) {
      // SourceCopy
      const d = r.vlq();
      sourceRelative += (d & 1 ? -1 : 1) * (d >> 1);
      while (length--) out[outputOffset++] = rom[sourceRelative++] ?? 0;
    } else {
      // TargetCopy
      const d = r.vlq();
      targetRelative += (d & 1 ? -1 : 1) * (d >> 1);
      while (length--) out[outputOffset++] = out[targetRelative++];
    }
  }

  const expectedTargetCrc = readUint32LE(patch, patch.length - 8);
  if (crc32(out) !== expectedTargetCrc) {
    warnings.push("Patched output CRC doesn't match the patch's expectation");
  }
  return { data: out, warnings };
}

// ---------------- entry point ----------------

export const PATCH_EXTENSIONS = [".ips", ".ups", ".bps"];

export function applyPatch(rom: Uint8Array, patch: Uint8Array, patchName: string): PatchResult {
  const ext = patchName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (ext === ".ips") return applyIps(rom, patch);
  if (ext === ".ups") return applyUps(rom, patch);
  if (ext === ".bps") return applyBps(rom, patch);
  // Fall back to sniffing the header
  const header = ascii(patch, 0, 5);
  if (header.startsWith("PATCH")) return applyIps(rom, patch);
  if (header.startsWith("UPS1")) return applyUps(rom, patch);
  if (header.startsWith("BPS1")) return applyBps(rom, patch);
  throw new Error("Unsupported patch format — use .ips, .ups, or .bps");
}
