// Reads named entries from a zip archive (stored or deflated, no zip64), enough to pull one layer out of a large
// download such as OS Boundary-Line without unpacking all of it. Used by scripts/fetch_sources.js --origin.
const zlib = require('zlib');

/** Entries of a zip buffer: [{name, data()}], data() inflating on demand. */
function zipEntries(buf) {
  // the end-of-central-directory record is in the last 64 KB
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('not a zip archive');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip central directory');
    const method = buf.readUInt16LE(p + 10),
      size = buf.readUInt32LE(p + 20),
      nameLen = buf.readUInt16LE(p + 28),
      extraLen = buf.readUInt16LE(p + 30),
      commentLen = buf.readUInt16LE(p + 32),
      local = buf.readUInt32LE(p + 42),
      name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    out.push({
      name,
      data() {
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28),
          raw = buf.subarray(start, start + size);
        if (method === 0) return Buffer.from(raw);
        if (method === 8) return zlib.inflateRawSync(raw);
        throw new Error(name + ': unsupported zip compression ' + method);
      },
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

module.exports = { zipEntries };
