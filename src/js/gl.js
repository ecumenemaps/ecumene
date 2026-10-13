// WebGL2 renderer for the globe: ocean and shading (fullscreen pass), country fills and lakes
// (triangle meshes projected in the vertex shader), and lines (instanced quads: borders,
// graticule, lake outlines, rivers, hover outline).
import { app } from './store.js';
import { V, D, rgb01, lum } from './util.js';

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
// Fill colour per country comes from a 256x1 palette texture (alpha 0 = unpainted -> land colour).
// uFlat overrides the colour (used for lakes).
const VS_FILL = `#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
in vec2 aLL;in uint aId;uniform vec2 uRes;uniform float uR;uniform vec3 uC,uE,uN,uLand;uniform sampler2D uPal;uniform int uHover;uniform float uDark;uniform vec4 uFlat;
flat out vec3 vCol;out float vZ;
void main(){
 float lo=aLL.x*0.017453292,la=aLL.y*0.017453292;float c=cos(la);vec3 P=vec3(c*cos(lo),c*sin(lo),sin(la));
 vec3 v=vec3(dot(P,uE),dot(P,uN),dot(P,uC));
 vec3 cc=uFlat.rgb;
 if(uFlat.a<.5){vec4 pc=texelFetch(uPal,ivec2(int(aId),0),0);cc=pc.a>.5?pc.rgb:uLand;
  if(int(aId)==uHover){float lu=dot(cc,vec3(.299,.587,.114));cc=lu>.45?cc*(1.-uDark):mix(cc,vec3(1.),uDark);}}
 vCol=cc;vZ=v.z;
 gl_Position=vec4(((uRes*.5+v.xy*uR)/uRes)*2.-1.,0.,1.);
}`;
const FS_FILL = `#version 300 es
precision highp float;flat in vec3 vCol;in float vZ;out vec4 o;
void main(){if(vZ<0.)discard;o=vec4(vCol,1.);}`;

let gl, cv, pFull, pLine, pFill;
const uF = {},
  uL = {},
  uP = {};
const pal = new Uint8Array(256 * 4);
let palTex, BL, HL, LO, LOM, GRL, RV;
const TV = { vao: null, n: 0 },
  LK = { vao: null, n: 0 };
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
    pFill = program(VS_FILL, FS_FILL, ['uRes', 'uR', 'uC', 'uE', 'uN', 'uLand', 'uPal', 'uHover', 'uDark', 'uFlat'], uP);
  } catch (e) {
    return 'Shader error: ' + e.message;
  }
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  palTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, palTex);
  for (const [k, v] of [
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_MIN_FILTER, gl.NEAREST],
    [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
  ])
    gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pal);
  gl.useProgram(pFill);
  gl.uniform1i(uP.uPal, 1);
  BL = lineSet();
  HL = lineSet();
  LO = lineSet();
  LOM = lineSet();
  GRL = lineSet();
  RV = [lineSet(), lineSet(), lineSet()];
  TV.vao = gl.createVertexArray();
  LK.vao = gl.createVertexArray();
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
    gl.vertexAttribIPointer(l, 1, gl.UNSIGNED_BYTE, 0, 0);
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
export function uploadPhys(p) {
  meshVAO(LK, p.lakeLL, p.lakeIdx, null);
  setLines(LO, packedSegs(p.lakeLines.pts, p.lakeLines.lens, 0, p.lakeLines.lens.length));
  setLines(LOM, packedSegs(p.lakeLines.pts, p.lakeLines.lens, 0, p.lakeMajor.rings));
  LK.nMajor = p.lakeMajor.idx;
  p.rivers.tiers.forEach(([a, b], i) => setLines(RV[i], packedSegs(p.rivers.pts, p.rivers.lens, a, b)));
}
export const setBorders = (arr) => setLines(BL, arr);
export const setHoverOutline = (arr) => (arr ? setLines(HL, arr) : (HL.n = 0));

/** Set (hex) or clear (null) the fill colour for a country id. */
export function setCountryColor(id, hex) {
  if (hex) {
    const c = rgb01(hex);
    pal.set([c[0] * 255, c[1] * 255, c[2] * 255, 255], id * 4);
  } else pal[id * 4 + 3] = 0;
  gl.activeTexture(gl.TEXTURE1);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, pal);
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
  gl.uniform1i(uP.uHover, app.hover);
  gl.uniform1f(uP.uDark, HS.dark ? HS.amt : 0);
  gl.uniform4f(uP.uFlat, 0, 0, 0, 0);
  gl.bindVertexArray(TV.vao);
  gl.drawElements(gl.TRIANGLES, TV.n, gl.UNSIGNED_INT, 0);
  const lakeN = Ly.lakes === 'all' ? LK.n : Ly.lakes === 'major' ? LK.nMajor : 0;
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
  if (lakeN) lines(Ly.lakes === 'all' ? LO : LOM, 0.9, S.river, 0.9);
  if (Ly.rivers)
    RV.forEach((r, i) => {
      if (app.zoom >= RIVER_MIN_ZOOM[i]) lines(r, RIVER_WIDTH[i], S.river, 0.95);
    });
  if (Ly.borders) lines(BL, S.bw, S.border, 0.95);
  full(1);
  gl.useProgram(pLine);
  if (HS.outline && app.hover) lines(HL, 2.4, lum(S.water) > 0.5 ? '#111111' : '#ffffff', 1);
  gl.bindVertexArray(null);
}
