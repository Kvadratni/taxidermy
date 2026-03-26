/**
 * Minimal ZIP reader/writer — replaces the xlsx package's ZIP layer.
 * Uses native DecompressionStream/CompressionStream APIs.
 */

// ── CRC-32 ──────────────────────────────────────────────────────────────────

const crcTable: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function readUint16(buf: DataView, offset: number): number {
  return buf.getUint16(offset, true);
}

function readUint32(buf: DataView, offset: number): number {
  return buf.getUint32(offset, true);
}

const textDecoder = new TextDecoder();

// ── ZIP Reader ──────────────────────────────────────────────────────────────

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export async function readZip(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Find End of Central Directory (scan backwards for signature 0x06054b50)
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (readUint32(view, i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('Invalid ZIP: EOCD not found');

  const cdEntryCount = readUint16(view, eocdOffset + 10);
  const cdOffset = readUint32(view, eocdOffset + 16);

  const entries: ZipEntry[] = [];
  let pos = cdOffset;

  for (let i = 0; i < cdEntryCount; i++) {
    if (readUint32(view, pos) !== 0x02014b50) break;

    const method = readUint16(view, pos + 10);
    const compSize = readUint32(view, pos + 20);
    const uncompSize = readUint32(view, pos + 24);
    const nameLen = readUint16(view, pos + 28);
    const extraLen = readUint16(view, pos + 30);
    const commentLen = readUint16(view, pos + 32);
    const localHeaderOffset = readUint32(view, pos + 42);

    const name = textDecoder.decode(bytes.slice(pos + 46, pos + 46 + nameLen));

    // Read from local file header
    const lfhNameLen = readUint16(view, localHeaderOffset + 26);
    const lfhExtraLen = readUint16(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;
    const compressedData = bytes.slice(dataStart, dataStart + compSize);

    let data: Uint8Array;
    if (method === 0) {
      // Stored
      data = compressedData;
    } else if (method === 8) {
      // Deflate — use native DecompressionStream
      data = await inflateRaw(compressedData, uncompSize);
    } else {
      // Skip unsupported methods
      pos += 46 + nameLen + extraLen + commentLen;
      continue;
    }

    entries.push({ name, data });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

async function inflateRaw(compressed: Uint8Array, _expectedSize: number): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  writer.write(compressed as unknown as BufferSource);
  writer.close();

  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }

  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// ── ZIP Writer (store method — no compression for simplicity) ───────────────

export function writeZip(files: { name: string; data: Uint8Array }[]): ArrayBuffer {
  const textEncoder = new TextEncoder();
  const entries: { name: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];

  // Calculate total size: local headers + data + central directory + EOCD
  let localSize = 0;
  for (const f of files) {
    const nameBytes = textEncoder.encode(f.name);
    localSize += 30 + nameBytes.length + f.data.length;
  }

  let cdSize = 0;
  for (const f of files) {
    const nameBytes = textEncoder.encode(f.name);
    cdSize += 46 + nameBytes.length;
  }

  const totalSize = localSize + cdSize + 22;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const out = new Uint8Array(buf);
  let pos = 0;

  // Write local file headers + data
  for (const f of files) {
    const nameBytes = textEncoder.encode(f.name);
    const fileCrc = crc32(f.data);
    const offset = pos;

    entries.push({ name: nameBytes, data: f.data, crc: fileCrc, offset });

    // Local file header
    view.setUint32(pos, 0x04034b50, true); pos += 4;
    view.setUint16(pos, 20, true); pos += 2; // version needed
    view.setUint16(pos, 0, true); pos += 2;  // flags
    view.setUint16(pos, 0, true); pos += 2;  // method: stored
    view.setUint16(pos, 0, true); pos += 2;  // mod time
    view.setUint16(pos, 0, true); pos += 2;  // mod date
    view.setUint32(pos, fileCrc, true); pos += 4;
    view.setUint32(pos, f.data.length, true); pos += 4; // compressed size
    view.setUint32(pos, f.data.length, true); pos += 4; // uncompressed size
    view.setUint16(pos, nameBytes.length, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2; // extra field length

    out.set(nameBytes, pos); pos += nameBytes.length;
    out.set(f.data, pos); pos += f.data.length;
  }

  // Write central directory
  const cdOffset = pos;
  for (const e of entries) {
    view.setUint32(pos, 0x02014b50, true); pos += 4;
    view.setUint16(pos, 20, true); pos += 2; // version made by
    view.setUint16(pos, 20, true); pos += 2; // version needed
    view.setUint16(pos, 0, true); pos += 2;  // flags
    view.setUint16(pos, 0, true); pos += 2;  // method
    view.setUint16(pos, 0, true); pos += 2;  // mod time
    view.setUint16(pos, 0, true); pos += 2;  // mod date
    view.setUint32(pos, e.crc, true); pos += 4;
    view.setUint32(pos, e.data.length, true); pos += 4;
    view.setUint32(pos, e.data.length, true); pos += 4;
    view.setUint16(pos, e.name.length, true); pos += 2;
    view.setUint16(pos, 0, true); pos += 2; // extra
    view.setUint16(pos, 0, true); pos += 2; // comment
    view.setUint16(pos, 0, true); pos += 2; // disk start
    view.setUint16(pos, 0, true); pos += 2; // internal attrs
    view.setUint32(pos, 0, true); pos += 4;  // external attrs
    view.setUint32(pos, e.offset, true); pos += 4;
    out.set(e.name, pos); pos += e.name.length;
  }

  // End of Central Directory
  const cdLength = pos - cdOffset;
  view.setUint32(pos, 0x06054b50, true); pos += 4;
  view.setUint16(pos, 0, true); pos += 2; // disk
  view.setUint16(pos, 0, true); pos += 2; // cd disk
  view.setUint16(pos, entries.length, true); pos += 2;
  view.setUint16(pos, entries.length, true); pos += 2;
  view.setUint32(pos, cdLength, true); pos += 4;
  view.setUint32(pos, cdOffset, true); pos += 4;
  view.setUint16(pos, 0, true); // comment length

  return buf;
}
