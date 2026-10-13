// Decoders for the packed binary data built by scripts/build_tris.js and scripts/build_phys.js.
// Both formats are little-endian, deflate-raw compressed, with coordinates quantised to 1e-5 degrees
// and delta-coded. Pure functions so they can be unit tested in Node.

export async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).arrayBuffer();
}

function undelta(q, n) {
  const o = new Float32Array(2 * n);
  let x = 0,
    y = 0;
  for (let i = 0; i < n; i++) {
    x += q[2 * i];
    y += q[2 * i + 1];
    o[2 * i] = x / 1e5;
    o[2 * i + 1] = y / 1e5;
  }
  return o;
}
function prefix(d, n) {
  const o = new Uint32Array(n);
  let p = 0;
  for (let i = 0; i < n; i++) {
    p += d[i];
    o[i] = p;
  }
  return o;
}

/** Country fill mesh: {ll: Float32Array lon/lat pairs, ids: Uint8Array country id per vertex, idx: Uint32Array triangles} */
export function decodeTris(buf) {
  const h = new Uint32Array(buf, 0, 2),
    nv = h[0],
    ni = h[1];
  const ll = undelta(new Int32Array(buf, 8, 2 * nv), nv);
  let off = 8 + 8 * nv;
  const ids = new Uint8Array(buf, off, nv);
  off += (nv + 3) & ~3;
  const idx = prefix(new Int32Array(buf, off, ni), ni);
  return { ll, ids, idx };
}

/** Lakes (triangles + outlines) and rivers (polylines in three zoom tiers). */
export function decodePhys(buf) {
  const [nLV, nLI, nRP, nRG, nVP, nVL, t0, t1] = new Uint32Array(buf, 0, 8);
  let off = 32;
  const take = (n) => {
    const a = new Int32Array(buf, off, n);
    off += 4 * n;
    return a;
  };
  const lq = take(2 * nLV),
    li = take(nLI),
    rq = take(2 * nRP),
    rl = take(nRG),
    vq = take(2 * nVP),
    vl = take(nVL);
  return {
    lakeLL: undelta(lq, nLV),
    lakeIdx: prefix(li, nLI),
    lakeLines: { pts: undelta(rq, nRP), lens: rl },
    rivers: {
      pts: undelta(vq, nVP),
      lens: vl,
      tiers: [
        [0, t0],
        [t0, t0 + t1],
        [t0 + t1, nVL],
      ],
    },
  };
}
