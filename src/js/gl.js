// WebGL2 renderer for the globe: ocean and shading (fullscreen pass), country fills and lakes
// (triangle meshes projected in the vertex shader), and lines (instanced quads: borders,
// graticule, lake outlines, rivers, hover outline).
import { app } from './store.js';
import { V, D, rgb01, lum } from './util.js';
import { parsePaint, PATTERN_TYPES } from './patterns.js';

const VS_FULL = `#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}`;
// mode 0: ocean disc on background; mode 1: limb shading, highlight and rim
const FS_FULL = `#version 300 es
precision highp float;
uniform vec2 uRes;uniform float uR,uShade;uniform vec3 uBg,uOcean,uBorder;uniform int uMode;out vec4 o;
vec4 over(vec4 t,vec4 b){float a=t.a+b.a*(1.-t.a);return a<1e-5?vec4(0.):vec4((t.rgb*t.a+b.rgb*b.a*(1.-t.a))/a,a);}
void main(){
 vec2 q=(gl_FragCoord.xy-uRes*.5)/uR;float rr=length(q);
 if(uMode==0){o=vec4(rr>1.?uBg:uOcean,1.);return;}
 if(rr>1.){o=vec4(0.);return;}
 vec4 c=vec4(1.,1.,1.,max(0.,1.-length(q-vec2(-.35,.4))*1.1)*.18*uShade);
 c=over(vec4(0.,0.,0.,.28*uShade*smoothstep(.6,1.,rr)),c);
 o=over(vec4(uBorder,smoothstep(1.-1.5/uR,1.,rr)),c);
}`;
const VS_LINE = `#version 300 es
precision highp float;
in vec3 aA;in vec3 aB;uniform vec2 uRes;uniform float uR,uW;uniform vec3 uC,uE,uN;out float vD;out float vF;
void main(){
 vec3 a=vec3(dot(aA,uE),dot(aA,uN),dot(aA,uC));vec3 b=vec3(dot(aB,uE),dot(aB,uN),dot(aB,uC));
 if(a.z<0.&&b.z<0.){gl_Position=vec4(2.,2.,2.,1.);vD=0.;vF=0.;return;}
 if(a.z<0.){float t=a.z/(a.z-b.z);a=mix(a,b,t);}else if(b.z<0.){float t=b.z/(b.z-a.z);b=mix(b,a,t);}
 vec2 pa=uRes*.5+a.xy*uR,pb=uRes*.5+b.xy*uR;vec2 d=pb-pa;float len=length(d);
 vec2 dir=len>1e-4?d/len:vec2(1.,0.);vec2 nrm=vec2(-dir.y,dir.x);float hw=uW*.5;
 int e=gl_VertexID>>1;float s=float((gl_VertexID&1)*2-1);
 vec2 p=(e==0?pa:pb)+dir*(e==0?-hw:hw)+nrm*s*(hw+1.);
 gl_Position=vec4((p/uRes)*2.-1.,0.,1.);vD=s*(hw+1.);vF=clamp((e==0?a.z:b.z)*6.,0.,1.);
}`;
const FS_LINE = `#version 300 es
precision highp float;in float vD;in float vF;uniform vec4 uCol;uniform float uW;out vec4 o;
void main(){float hw=uW*.5;float al=1.-smoothstep(hw-.5,hw+.5,abs(vD));o=vec4(uCol.rgb,uCol.a*al*vF);}`;
// Fill colour per country comes from a palette texture, entry id at (id % 1024, id / 1024) (alpha 0 = unpainted ->
// land colour). The subdivision pass uses its own palette and uSkip=1, so unpainted units are not drawn at all and
// the country's fill shows through. uFlat overrides the colour (used for lakes). A second texture of the same shape
// holds pattern fills (patterns.js): rgb the pattern colour, alpha the pattern type (0 none); the fragment shader
// draws the pattern in CSS pixels (uPx device pixels each), the same shapes as the SVG and canvas tiles. The pattern is
// laid out from an anchor on the Earth (uAnc: lon/lat per id, the centre of the country's largest part), projected
// each frame, so it moves with the country when the globe turns instead of staying still on the screen. It is also
// turned to follow the country: its "up" is the direction of north at the anchor as drawn on the screen (vNor), so a
// country that tilts as it moves away from the centre of the globe takes its pattern with it.
const VS_FILL = `#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
in vec2 aLL;in uint aId;uniform vec2 uRes;uniform float uR;uniform vec3 uC,uE,uN,uLand;uniform sampler2D uPal,uPat,uAnc;uniform int uHover;uniform float uDark;uniform vec4 uFlat;uniform int uSkip;
flat out vec3 vCol;flat out vec4 vPat;flat out float vA;flat out vec2 vAnc;flat out vec2 vNor;out float vZ;
vec3 shade(vec3 cc){float lu=dot(cc,vec3(.299,.587,.114));return lu>.45?cc*(1.-uDark):mix(cc,vec3(1.),uDark);}
vec3 sphere(vec2 ll){float lo=ll.x*0.017453292,la=ll.y*0.017453292;float c=cos(la);return vec3(c*cos(lo),c*sin(lo),sin(la));}
void main(){
 vec3 P=sphere(aLL);
 vec3 v=vec3(dot(P,uE),dot(P,uN),dot(P,uC));
 vAnc=vec2(0.);vNor=vec2(0.,1.);
 vec3 cc=uFlat.rgb;vA=1.;vPat=vec4(0.);
 if(uFlat.a<.5){int id=int(aId);ivec2 at=ivec2(id&1023,id>>10);vec4 pc=texelFetch(uPal,at,0);cc=pc.a>.5?pc.rgb:uLand;
  if(pc.a>.5){vPat=texelFetch(uPat,at,0);vec2 ll=texelFetch(uAnc,at,0).rg;vec3 A=sphere(ll);vAnc=uRes*.5+vec2(dot(A,uE),dot(A,uN))*uR;
   // north at the anchor (the derivative of the point by latitude), as drawn on the screen, y up
   float lo=ll.x*0.017453292,la=ll.y*0.017453292;vec3 Nl=vec3(-sin(la)*cos(lo),-sin(la)*sin(lo),cos(la));
   vec2 n2=vec2(dot(Nl,uE),dot(Nl,uN));if(length(n2)>1e-4)vNor=normalize(n2);}
  if(uSkip==1&&pc.a<.5)vA=0.;
  if(id==uHover){cc=shade(cc);vPat.rgb=shade(vPat.rgb);}}
 vCol=cc;vZ=v.z;
 gl_Position=vec4(((uRes*.5+v.xy*uR)/uRes)*2.-1.,0.,1.);
}`;
const FS_FILL = `#version 300 es
precision highp float;flat in vec3 vCol;flat in vec4 vPat;flat in float vA;flat in vec2 vAnc;flat in vec2 vNor;in float vZ;uniform vec2 uRes;uniform float uPx;out vec4 o;
// 1 when the pattern's ink covers point q (CSS pixels, y down), with a soft edge of about a device pixel
float band(float d,float w,float aa){return 1.-smoothstep(w*.5-aa,w*.5+aa,d);}
float diag(float s,float T,float w,float aa){float d=mod(s,T);return band(min(d,T-d)*.70710678,w,aa);}
float mask(int t,vec2 q,float aa){
 if(t==1)return diag(q.x+q.y,8.,1.6,aa);
 if(t==2)return diag(q.x+q.y,12.,4.5,aa);
 if(t==3)return band(abs(mod(q.y,8.)-4.),2.,aa);
 if(t==4)return band(abs(mod(q.x,8.)-4.),2.,aa);
 if(t==5)return max(diag(q.x+q.y,8.,1.2,aa),diag(q.x-q.y,8.,1.2,aa));
 if(t==6)return band(length(mod(q,8.)-4.),3.8,aa);
 if(t==7){vec2 k=floor(q/6.);return mod(k.x+k.y,2.)<.5?1.:0.;}
 if(t==8)return band(length(mod(q,4.)-2.),1.5,aa);
 return 0.;}
void main(){if(vZ<0.||vA<.5)discard;
 int t=int(vPat.a*255.+.5);vec3 col=vCol;
 // q: CSS pixels from the projected anchor, along the country's east (x) and south (y) as drawn on the screen
 if(t>0){vec2 d=gl_FragCoord.xy-vAnc;vec2 e=vec2(vNor.y,-vNor.x);vec2 q=vec2(dot(d,e),-dot(d,vNor))/uPx;col=mix(vCol,vPat.rgb,mask(t,q,.6/uPx));}
 o=vec4(col,1.);}`;

let gl, cv, pFull, pLine, pFill;
const uF = {},
  uL = {},
  uP = {};
// palette entries: country ids are 16-bit in the mesh; WebGL2 guarantees textures at least 2048 wide
export const PAL_N = 1024;
const pal = new Uint8Array(PAL_N * 4),
  pat = new Uint8Array(PAL_N * 4);
// subdivision palette: 1024 x UPAL_ROWS entries, one per loaded unit (units.js assigns the ids)
export const UPAL_ROWS = 8;
const upal = new Uint8Array(1024 * UPAL_ROWS * 4),
  upat = new Uint8Array(1024 * UPAL_ROWS * 4);
// pattern anchors (lon, lat) per country id and per unit id: patterns are laid out from them (see VS_FILL)
const anc = new Float32Array(PAL_N * 2),
  uanc = new Float32Array(1024 * UPAL_ROWS * 2);
let palTex, upalTex, patTex, upatTex, ancTex, uancTex, uancDirty = false, BL, HL, LO, LOM, SL, GRL, RV;
/** Write a paint (hex color or pattern) into palette and pattern bytes at entry i. */
export function putPaint(palette, patterns, i, paint) {
  const p = parsePaint(paint),
    c = rgb01(p ? p.bg : paint);
  palette.set([c[0] * 255, c[1] * 255, c[2] * 255, 255], i * 4);
  if (p) {
    const f = rgb01(p.fg);
    patterns.set([f[0] * 255, f[1] * 255, f[2] * 255, PATTERN_TYPES.indexOf(p.type) + 1], i * 4);
  } else patterns[i * 4 + 3] = 0;
}
const TV = { vao: null, n: 0 },
  LK = { vao: null, n: 0 },
  UV = { vao: null, n: 0, bufs: null };
let unitPaint = null;
/** Set the function that fills the subdivision palette (RGBA bytes per unit id) before each frame. */
export const setUnitPainter = (fn) => (unitPaint = fn);
export const RIVER_MIN_ZOOM = [0, 2, 4],
  RIVER_WIDTH = [1.5, 1.1, 0.8];

function program(vs, fs, uniforms, out) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  uniforms.forEach((n) => (out[n] = gl.getUniformLocation(p, n)));
  return p;
}
function lineSet() {
  const vao = gl.createVertexArray(),
    buf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  [
    ['aA', 0],
    ['aB', 12],
  ].forEach(([n, off]) => {
    const l = gl.getAttribLocation(pLine, n);
    gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 24, off);
    gl.vertexAttribDivisor(l, 1);
  });
  gl.bindVertexArray(null);
  return { vao, buf, n: 0 };
}
function setLines(o, arr) {
  gl.bindBuffer(gl.ARRAY_BUFFER, o.buf);
  gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
  o.n = arr.length / 6;
}

/** Line segments (unit-vector pairs) from lon/lat polylines. Skips antimeridian and south-pole artefacts. */
export function segs(lines) {
  let n = 0;
  for (const ln of lines) n += Math.max(0, ln.length - 1);
  const a = new Float32Array(n * 6);
  let k = 0;
  for (const ln of lines)
    for (let i = 1; i < ln.length; i++) {
      const p = ln[i - 1],
        q = ln[i];
      if (Math.abs(p[0]) >= 179.99 && Math.abs(q[0]) >= 179.99 && p[0] * q[0] > 0) continue;
      if (p[1] <= -89.9 && q[1] <= -89.9) continue;
      a.set(V(p[0], p[1]), k);
      a.set(V(q[0], q[1]), k + 3);
      k += 6;
    }
  return a.subarray(0, k);
}
// segments from packed polylines (flat lon/lat array + lengths), restricted to lines [from, to)
function packedSegs(pts, lens, from, to) {
  let start = 0,
    cnt = 0;
  for (let i = 0; i < from; i++) start += lens[i];
  for (let i = from; i < to; i++) cnt += Math.max(0, lens[i] - 1);
  const a = new Float32Array(cnt * 6);
  let k = 0,
    pi = start;
  for (let i = from; i < to; i++) {
    for (let m = 1; m < lens[i]; m++) {
      a.set(V(pts[2 * (pi + m - 1)], pts[2 * (pi + m - 1) + 1]), k);
      a.set(V(pts[2 * (pi + m)], pts[2 * (pi + m) + 1]), k + 3);
      k += 6;
    }
    pi += lens[i];
  }
  return a;
}

/** Create the WebGL2 context and programs. Returns an error message, or '' on success. */
export function initGL(canvas) {
  cv = canvas;
  gl = cv.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return 'This page needs WebGL2, which this browser does not support.';
  try {
    pFull = program(VS_FULL, FS_FULL, ['uRes', 'uR', 'uShade', 'uBg', 'uOcean', 'uBorder', 'uMode'], uF);
    pLine = program(VS_LINE, FS_LINE, ['uRes', 'uR', 'uW', 'uC', 'uE', 'uN', 'uCol'], uL);
    pFill = program(VS_FILL, FS_FILL, ['uRes', 'uR', 'uC', 'uE', 'uN', 'uLand', 'uPal', 'uPat', 'uAnc', 'uPx', 'uHover', 'uDark', 'uFlat', 'uSkip'], uP);
  } catch (e) {
    return 'Shader error: ' + e.message;
  }
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const palette = (w, h, data, unit = gl.TEXTURE1) => {
    const t = gl.createTexture();
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_MIN_FILTER, gl.NEAREST],
      [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
    ])
      gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return t;
  };
  upalTex = palette(1024, UPAL_ROWS, upal);
  palTex = palette(PAL_N, 1, pal); // left bound on TEXTURE1
  upatTex = palette(1024, UPAL_ROWS, upat, gl.TEXTURE2);
  patTex = palette(PAL_N, 1, pat, gl.TEXTURE2); // left bound on TEXTURE2
  // anchors: two floats per entry, read with texelFetch (float textures are not filtered)
  const anchors = (w, h, data) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, w, h, 0, gl.RG, gl.FLOAT, data);
    return t;
  };
  uancTex = anchors(1024, UPAL_ROWS, uanc);
  ancTex = anchors(PAL_N, 1, anc); // left bound on TEXTURE3
  gl.useProgram(pFill);
  gl.uniform1i(uP.uPal, 1);
  gl.uniform1i(uP.uPat, 2);
  gl.uniform1i(uP.uAnc, 3);
  BL = lineSet();
  HL = lineSet();
  LO = lineSet();
  LOM = lineSet();
  SL = lineSet();
  GRL = lineSet();
  RV = [lineSet(), lineSet(), lineSet()];
  TV.vao = gl.createVertexArray();
  LK.vao = gl.createVertexArray();
  UV.vao = gl.createVertexArray();
  // graticule: 10 degree meridians and parallels, finely segmented so they curve correctly.
  // Meridians stop at 80 degrees (except every 90th) so they do not clot at the poles.
  const g = [],
    add = (o1, a1, o2, a2) => g.push(...V(o1, a1), ...V(o2, a2));
  for (let lo = -180; lo < 180; lo += 10) {
    const top = lo % 90 ? 80 : 90;
    for (let la = -top; la < top; la += 2) add(lo, la, lo, Math.min(top, la + 2));
  }
  for (let la = -80; la <= 80; la += 10) for (let lo = -180; lo < 180; lo += 2) add(lo, la, lo + 2, la);
  setLines(GRL, new Float32Array(g));
  return '';
}

function meshVAO(target, ll, idx, ids) {
  gl.bindVertexArray(target.vao);
  let b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, ll, gl.STATIC_DRAW);
  let l = gl.getAttribLocation(pFill, 'aLL');
  gl.enableVertexAttribArray(l);
  gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
  if (ids) {
    b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, ids, gl.STATIC_DRAW);
    l = gl.getAttribLocation(pFill, 'aId');
    gl.enableVertexAttribArray(l);
    gl.vertexAttribIPointer(l, 1, gl.UNSIGNED_SHORT, 0, 0);
  }
  b = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  target.n = idx.length;
}
export function uploadTris(t) {
  meshVAO(TV, t.ll, t.idx, t.ids);
}
/** Replace the subdivision fill mesh (all loaded countries' units; ids index the subdivision palette). */
export function uploadUnitMesh(ll, idx, ids) {
  gl.bindVertexArray(UV.vao);
  if (!UV.bufs) {
    UV.bufs = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];
    gl.bindBuffer(gl.ARRAY_BUFFER, UV.bufs[0]);
    let l = gl.getAttribLocation(pFill, 'aLL');
    gl.enableVertexAttribArray(l);
    gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, UV.bufs[1]);
    l = gl.getAttribLocation(pFill, 'aId');
    gl.enableVertexAttribArray(l);
    gl.vertexAttribIPointer(l, 1, gl.UNSIGNED_SHORT, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, UV.bufs[2]);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, UV.bufs[0]);
  gl.bufferData(gl.ARRAY_BUFFER, ll, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, UV.bufs[1]);
  gl.bufferData(gl.ARRAY_BUFFER, ids, gl.STATIC_DRAW);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  UV.n = idx.length;
}
export function uploadPhys(p) {
  meshVAO(LK, p.lakeLL, p.lakeIdx, null);
  // always-water shores are drawn with the borders; the lake shore sets start after them
  const s = p.lakeSea.rings;
  setLines(SL, packedSegs(p.lakeLines.pts, p.lakeLines.lens, 0, s));
  setLines(LO, packedSegs(p.lakeLines.pts, p.lakeLines.lens, s, p.lakeLines.lens.length));
  setLines(LOM, packedSegs(p.lakeLines.pts, p.lakeLines.lens, s, p.lakeMajor.rings));
  LK.nMajor = p.lakeMajor.idx;
  LK.nSea = p.lakeSea.idx;
  p.rivers.tiers.forEach(([a, b], i) => setLines(RV[i], packedSegs(p.rivers.pts, p.rivers.lens, a, b)));
}
export const setBorders = (arr) => setLines(BL, arr);
export const setHoverOutline = (arr) => (arr ? setLines(HL, arr) : (HL.n = 0));

/** Pattern anchors of the countries: [[id, lon, lat], ...]. */
export function setAnchors(list) {
  for (const [id, lon, lat] of list) {
    anc[id * 2] = lon;
    anc[id * 2 + 1] = lat;
  }
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, ancTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PAL_N, 1, gl.RG, gl.FLOAT, anc);
}
/** A country's pattern anchor, [lon, lat]. */
export const anchorOf = (id) => [anc[id * 2], anc[id * 2 + 1]];
/** A unit takes its country's anchor, so a pattern runs on unbroken across the units of one country. */
export function setUnitAnchor(gid, countryId) {
  uanc[gid * 2] = anc[countryId * 2];
  uanc[gid * 2 + 1] = anc[countryId * 2 + 1];
  uancDirty = true;
}

/** Set (a hex color or pattern paint) or clear (null) the fill of a country id. */
export function setCountryColor(id, paint) {
  if (paint) putPaint(pal, pat, id, paint);
  else pal[id * 4 + 3] = pat[id * 4 + 3] = 0;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, palTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PAL_N, 1, gl.RGBA, gl.UNSIGNED_BYTE, pal);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, patTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PAL_N, 1, gl.RGBA, gl.UNSIGNED_BYTE, pat);
}

/** Draw the globe for the current view in app (rot, zoom, dpr, style, layers, hover). */
export function render(R) {
  const S = app.style,
    Ly = app.layers,
    HS = app.hoverStyle,
    dpr = app.dpr;
  const a = -app.rot[0] * D,
    b = -app.rot[1] * D,
    ca = Math.cos(a),
    sa = Math.sin(a),
    cb = Math.cos(b),
    sb = Math.sin(b);
  const C = [cb * ca, cb * sa, sb],
    E = [-sa, ca, 0],
    N = [-sb * ca, -sb * sa, cb];
  gl.viewport(0, 0, cv.width, cv.height);
  gl.bindVertexArray(null);
  const full = (mode) => {
    gl.useProgram(pFull);
    gl.uniform2f(uF.uRes, cv.width, cv.height);
    gl.uniform1f(uF.uR, R);
    gl.uniform1f(uF.uShade, S.shade);
    gl.uniform3f(uF.uBg, ...rgb01(S.bg));
    gl.uniform3f(uF.uOcean, ...rgb01(S.water));
    gl.uniform3f(uF.uBorder, ...rgb01(S.rim || S.border));
    gl.uniform1i(uF.uMode, mode);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  full(0);
  gl.useProgram(pFill);
  gl.uniform2f(uP.uRes, cv.width, cv.height);
  gl.uniform1f(uP.uR, R);
  gl.uniform3f(uP.uC, ...C);
  gl.uniform3f(uP.uE, ...E);
  gl.uniform3f(uP.uN, ...N);
  gl.uniform3f(uP.uLand, ...rgb01(S.land));
  // over subdivisions the hovered units are outlined on the overlay instead of shading the whole country
  gl.uniform1i(uP.uHover, app.subHov ? 0 : app.hover);
  gl.uniform1f(uP.uDark, HS.dark ? HS.amt : 0);
  gl.uniform4f(uP.uFlat, 0, 0, 0, 0);
  // patterns are sized in CSS pixels, so they look the same at any zoom and scale with PNG export
  gl.uniform1f(uP.uPx, dpr);
  gl.bindVertexArray(TV.vao);
  gl.drawElements(gl.TRIANGLES, TV.n, gl.UNSIGNED_INT, 0);
  // painted subdivisions over their countries; unpainted units are skipped
  if (UV.n && unitPaint && unitPaint(upal, upat)) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, upalTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1024, UPAL_ROWS, gl.RGBA, gl.UNSIGNED_BYTE, upal);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, upatTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1024, UPAL_ROWS, gl.RGBA, gl.UNSIGNED_BYTE, upat);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, uancTex);
    if (uancDirty) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1024, UPAL_ROWS, gl.RG, gl.FLOAT, uanc);
      uancDirty = false;
    }
    gl.uniform1i(uP.uSkip, 1);
    gl.uniform1i(uP.uHover, 0);
    gl.bindVertexArray(UV.vao);
    gl.drawElements(gl.TRIANGLES, UV.n, gl.UNSIGNED_INT, 0);
    gl.uniform1i(uP.uSkip, 0);
    gl.bindTexture(gl.TEXTURE_2D, ancTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, patTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, palTex);
  }
  // the always-water lakes come first, so every setting draws at least them
  const lakeN = Ly.lakes === 'all' ? LK.n : Ly.lakes === 'major' ? LK.nMajor : LK.nSea || 0;
  if (lakeN) {
    gl.uniform4f(uP.uFlat, ...rgb01(S.water), 1);
    gl.vertexAttribI4ui(gl.getAttribLocation(pFill, 'aId'), 0, 0, 0, 1);
    gl.bindVertexArray(LK.vao);
    gl.drawElements(gl.TRIANGLES, lakeN, gl.UNSIGNED_INT, 0);
  }
  gl.bindVertexArray(null);
  gl.useProgram(pLine);
  gl.uniform2f(uL.uRes, cv.width, cv.height);
  gl.uniform1f(uL.uR, R);
  gl.uniform3f(uL.uC, ...C);
  gl.uniform3f(uL.uE, ...E);
  gl.uniform3f(uL.uN, ...N);
  const lines = (set, width, hex, alpha) => {
    if (!set.n) return;
    const c = rgb01(hex);
    gl.uniform1f(uL.uW, width * dpr);
    gl.uniform4f(uL.uCol, c[0], c[1], c[2], alpha);
    gl.bindVertexArray(set.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, set.n);
  };
  if (Ly.grat) lines(GRL, 1, S.grat, 0.3);
  if (Ly.lakes !== 'none') lines(Ly.lakes === 'all' ? LO : LOM, 0.9, S.river, 0.9);
  if (Ly.rivers)
    RV.forEach((r, i) => {
      if (app.zoom >= RIVER_MIN_ZOOM[i]) lines(r, RIVER_WIDTH[i], S.river, 0.95);
    });
  if (Ly.borders) {
    lines(BL, S.bw, S.border, 0.95);
    lines(SL, S.bw, S.border, 0.95);
  }
  full(1);
  gl.useProgram(pLine);
  if (HS.outline && app.hover) lines(HL, 2.4, lum(S.water) > 0.5 ? '#111111' : '#ffffff', 1);
  gl.bindVertexArray(null);
}
