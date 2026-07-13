// Streaming ZIP (store method with data descriptors): serves multi-file
// downloads of any size without buffering them in memory. CRCs are computed
// while streaming; the central directory is emitted at the end.

import fs from "fs";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

interface Entry {
  name: string;
  path: string;
}

export function streamZip(entries: Entry[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        try {
          const central: Buffer[] = [];
          let offset = 0;

          const push = async (buf: Buffer) => {
            controller.enqueue(new Uint8Array(buf));
            offset += buf.length;
            // Light backpressure: yield when the consumer falls behind
            while ((controller.desiredSize ?? 1) <= 0) {
              await new Promise((r) => setTimeout(r, 25));
            }
          };

          for (const entry of entries) {
            const name = Buffer.from(entry.name, "utf8");
            const headerOffset = offset;

            // Local header: sizes/CRC deferred to the data descriptor (bit 3)
            const local = Buffer.alloc(30);
            local.writeUInt32LE(0x04034b50, 0);
            local.writeUInt16LE(20, 4);
            local.writeUInt16LE(0x0008, 6); // bit 3: data descriptor follows
            local.writeUInt16LE(0, 8); // store
            local.writeUInt16LE(0, 10);
            local.writeUInt16LE(0x21, 12);
            local.writeUInt16LE(name.length, 26);
            await push(local);
            await push(name);

            let crc = 0xffffffff;
            let size = 0;
            const stream = fs.createReadStream(entry.path, { highWaterMark: 1024 * 1024 });
            for await (const chunk of stream) {
              const buf = chunk as Buffer;
              for (let i = 0; i < buf.length; i++) {
                crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
              }
              size += buf.length;
              await push(buf);
            }
            const finalCrc = (crc ^ 0xffffffff) >>> 0;

            const descriptor = Buffer.alloc(16);
            descriptor.writeUInt32LE(0x08074b50, 0);
            descriptor.writeUInt32LE(finalCrc, 4);
            descriptor.writeUInt32LE(size, 8);
            descriptor.writeUInt32LE(size, 12);
            await push(descriptor);

            const cd = Buffer.alloc(46);
            cd.writeUInt32LE(0x02014b50, 0);
            cd.writeUInt16LE(20, 4);
            cd.writeUInt16LE(20, 6);
            cd.writeUInt16LE(0x0008, 8);
            cd.writeUInt16LE(0, 10);
            cd.writeUInt16LE(0, 12);
            cd.writeUInt16LE(0x21, 14);
            cd.writeUInt32LE(finalCrc, 16);
            cd.writeUInt32LE(size, 20);
            cd.writeUInt32LE(size, 24);
            cd.writeUInt16LE(name.length, 28);
            cd.writeUInt32LE(headerOffset, 42);
            central.push(cd, name);
          }

          const cdStart = offset;
          for (const buf of central) await push(buf);
          const cdSize = offset - cdStart;

          const eocd = Buffer.alloc(22);
          eocd.writeUInt32LE(0x06054b50, 0);
          eocd.writeUInt16LE(entries.length, 8);
          eocd.writeUInt16LE(entries.length, 10);
          eocd.writeUInt32LE(cdSize, 12);
          eocd.writeUInt32LE(cdStart, 16);
          await push(eocd);
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      })();
    },
  });
}
