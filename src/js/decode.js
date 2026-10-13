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

/** Country fill mesh: {ll: Float32Array lon/lat pairs, ids: Uint16Array country id per vertex, idx: Uint32Array triangles} */
export function decodeTris(buf) {
  const h = new Uint32Array(buf, 0, 2),
    nv = h[0],
    ni = h[1];
  const ll = undelta(new Int32Array(buf, 8, 2 * nv), nv);
  let off = 8 + 8 * nv;
  const ids = new Uint16Array(buf, off, nv);
  off += 2 * ((nv + 1) & ~1);
  const idx = prefix(new Int32Array(buf, off, ni), ni);
  return { ll, ids, idx };
}

/** Lakes (triangles + outlines: always-water first, then major lakes, then the rest) and rivers (polylines in three zoom tiers). */
export function decodePhys(buf) {
  const [nLV, nLI, nRP, nRG, nVP, nVL, t0, t1, majIdx, majRings] = new Uint32Array(buf, 0, 10);
  // Files built before the always-water lakes have a 10-number header and no always-water prefix; files built
  // before the rings-per-polygon list have a 12-number header and no list.
  const body = 4 * (2 * nLV + nLI + 2 * nRP + nRG + 2 * nVP + nVL),
    old = buf.byteLength === 40 + body,
    noPolys = old || buf.byteLength === 48 + body;
  const [seaIdx, seaRings] = old ? [0, 0] : new Uint32Array(buf, 40, 2);
  const nPL = noPolys ? 0 : new Uint32Array(buf, 48, 1)[0];
  let off = old ? 40 : noPolys ? 48 : 52;
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
    vl = take(nVL),
    pl = noPolys ? null : take(nPL);
  return {
    lakeLL: undelta(lq, nLV),
    lakeIdx: prefix(li, nLI),
    lakeLines: { pts: undelta(rq, nRP), lens: rl },
    // Major lakes come first: their triangles are lakeIdx[0, majIdx), their outlines rings [0, majRings).
    lakeMajor: { idx: majIdx, rings: majRings },
    // Within that, the always-water lakes (drawn at every Lakes setting) are lakeIdx[0, seaIdx), rings [0, seaRings).
    lakeSea: { idx: seaIdx, rings: seaRings },
    // Rings per lake polygon, in ring order: its shore, then its islands. Null in older files.
    lakePolys: pl,
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
