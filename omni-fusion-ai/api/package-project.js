import { readJsonBody } from '../server/lib/http.js';
import { authorize, rateLimit, cleanString } from '../server/lib/security.js';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function safePath(value, fallback) {
  const path = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '').replace(/\.\.(\/|$)/g, '').trim();
  if (!path || path.length > 160 || /[\0<>:"|?*]/.test(path)) return fallback;
  return path;
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value & 0xffff, 0);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file, index) => {
    const name = Buffer.from(file.path, 'utf8');
    const data = Buffer.from(file.content, 'utf8');
    const crc = crc32(data);
    const localHeader = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name
    ]);
    localParts.push(localHeader, data);

    const centralHeader = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  });

  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(offset), u16(0)
  ]);
  return Buffer.concat([...localParts, central, end]);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST.' });
    return;
  }
  const access = authorize(req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const limiter = rateLimit(req);
  if (!limiter.ok) {
    res.status(limiter.status).json({ error: limiter.error });
    return;
  }

  const body = await readJsonBody(req);
  const files = [];
  const seen = new Set();
  for (const item of Array.isArray(body.files) ? body.files : []) {
    if (!item || typeof item.content !== 'string') continue;
    const path = safePath(item.path, `file-${files.length + 1}.txt`);
    if (seen.has(path)) continue;
    seen.add(path);
    files.push({ path, content: item.content.slice(0, 160000) });
    if (files.length >= 40) break;
  }
  if (!files.length) {
    res.status(400).json({ error: 'No files were supplied.' });
    return;
  }
  const total = files.reduce((sum, file) => sum + Buffer.byteLength(file.content), 0);
  if (total > 900000) {
    res.status(413).json({ error: 'Project is too large to package in this deployment.' });
    return;
  }

  const projectName = (cleanString(body.projectName, 80) || 'omnifusion-project')
    .toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'omnifusion-project';
  const zip = buildZip(files);
  res.status(200);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${projectName}.zip"`);
  res.setHeader('Content-Length', String(zip.length));
  res.setHeader('Cache-Control', 'no-store');
  res.end(zip);
}

export { buildZip, crc32 };
