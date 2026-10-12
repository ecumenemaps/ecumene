(()=>{
const $=id=>document.getElementById(id),D=Math.PI/180,tip=$('tip'),sr=$('sr'),ld=$('load'),st=$('st');
const hx=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
const topo=JSON.parse($('data').textContent);
const feats=topojson.feature(topo,topo.objects.countries).features.filter(f=>f.properties&&f.properties.name);
const ALIAS={'Baikonur':'Kazakhstan','USNB Guantanamo Bay':'Cuba'};
feats.forEach(f=>{const a=ALIAS[f.properties.name];if(a)f.properties.name=a;});
const nameId=new Map();feats.forEach((f,i)=>{if(!nameId.has(f.properties.name))nameId.set(f.properties.name,i+1);});
const LB=feats.map(f=>{const g=f.geometry;let poly=g.type==='Polygon'?g.coordinates:null,a=0;
 if(poly)a=d3.geoArea({type:'Polygon',coordinates:poly});
 else g.coordinates.forEach(p=>{const x=d3.geoArea({type:'Polygon',coordinates:p});if(x>a){a=x;poly=p;}});
 return {n:f.properties.name,a,c:d3.geoCentroid({type:'Polygon',coordinates:poly})};}).sort((x,y)=>y.a-x.a);
const cv=$('cv'),ov=$('ov'),stage=$('stage'),oc=ov.getContext('2d');
const gl=cv.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:true});
if(!gl){st.textContent='This page needs WebGL2, which this browser does not support.';return;}
const proj=d3.geoOrthographic().clipAngle(90),HOME=[-5,-30];
let rot=HOME.slice(),zoom=1,W=0,H=0,dpr=1,hover=0,active='#e4572e',dlc=null,ready=false;
const HS={dark:true,outline:false,tip:true,amt:.16};let mx=0,my=0,tt=0;
const PRE={light:{bg:'#ffffff',water:'#cfe6f5',land:'#f1efe9',border:'#8a97a3',river:'#4f93c4',grat:'#5f6b78',label:'#1b2430',shade:.4,bw:1.1},
 dark:{bg:'#0e1319',water:'#17364d',land:'#2c343d',border:'#66737f',river:'#5aa7d8',grat:'#e6ebf0',label:'#e6ebf0',shade:1,bw:1.1},
 mc:{bg:'#ffffff',water:'#c9e4f9',land:'#eeeeee',border:'#9a9a9a',river:'#2f6db5',grat:'#8a8a8a',label:'#1c5f9b',shade:0,bw:1}};
const S=Object.assign({},PRE.light);
const RG=[];let rgSel=-1,drawing=null,rgDrag=null;
const fills=new Map(),labels={},LG={title:'',pos:'bl',show:true,order:[]},T={},L={borders:true,lakes:true,rivers:false,grat:false,names:false,regions:true};
const Rb=()=>Math.min(W,H)/2*.94*zoom;
const VS=`#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}`;
const FS=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform vec2 uRes;uniform float uR,uOvW,uShade;uniform vec3 uC,uE,uN,uBg,uOcean,uBorder,uInk,uRiver;
uniform sampler2D uOv;uniform int uMode;out vec4 o;
const float PI=3.14159265;
vec4 over(vec4 t,vec4 b){float a=t.a+b.a*(1.-t.a);return a<1e-5?vec4(0.):vec4((t.rgb*t.a+b.rgb*b.a*(1.-t.a))/a,a);}
void main(){
 vec2 p=gl_FragCoord.xy;vec2 q=(p-uRes*.5)/uR;float rr=length(q);
 if(uMode==0){o=vec4(rr>1.?uBg:uOcean,1.);return;}
 if(rr>1.){o=vec4(0.);return;}
 if(uMode==4){
  vec4 c=vec4(1.,1.,1.,max(0.,1.-length(q-vec2(-.35,.4))*1.1)*.18*uShade);
  c=over(vec4(0.,0.,0.,.28*uShade*smoothstep(.6,1.,rr)),c);
  c=over(vec4(uBorder,smoothstep(1.-1.5/uR,1.,rr)),c);
  o=c;return;}
 float z=sqrt(max(0.,1.-rr*rr));vec3 w=z*uC+q.x*uE+q.y*uN;
 vec2 uv=vec2(atan(w.y,w.x)/(2.*PI)+.5,.5-asin(clamp(w.z,-1.,1.))/PI);
 float lod=max(0.,log2(uOvW/(2.*PI)/uR));vec3 m=textureLod(uOv,uv,lod).rgb;
 if(uMode==1)o=vec4(uOcean,smoothstep(.15,.6,m.r));
 else if(uMode==2)o=vec4(uRiver,clamp(m.g*2.5,0.,1.));
 else o=vec4(uInk,clamp(m.b*2.,0.,1.)*.3);
}`;
const VS2=`#version 300 es
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
const FS2=`#version 300 es
precision highp float;in float vD;in float vF;uniform vec4 uCol;uniform float uW;out vec4 o;
void main(){float hw=uW*.5;float al=1.-smoothstep(hw-.5,hw+.5,abs(vD));o=vec4(uCol.rgb,uCol.a*al*vF);}`;
function mkProg(v,f){const s=(t,c)=>{const x=gl.createShader(t);gl.shaderSource(x,c);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(x));return x;};
 const p=gl.createProgram();gl.attachShader(p,s(gl.VERTEX_SHADER,v));gl.attachShader(p,s(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
const V=(lo,la)=>{const l=lo*D,p=la*D,c=Math.cos(p);return [c*Math.cos(l),c*Math.sin(l),Math.sin(p)];};
function segs(lines){let n=0;for(const ln of lines)n+=Math.max(0,ln.length-1);const a=new Float32Array(n*6);let k=0;
 for(const ln of lines)for(let i=1;i<ln.length;i++){const p=ln[i-1],q=ln[i];
  if(Math.abs(p[0])>=179.99&&Math.abs(q[0])>=179.99&&p[0]*q[0]>0)continue;
  if(p[1]<=-89.9&&q[1]<=-89.9)continue;
  const s=V(p[0],p[1]),t=V(q[0],q[1]);a[k++]=s[0];a[k++]=s[1];a[k++]=s[2];a[k++]=t[0];a[k++]=t[1];a[k++]=t[2];}
 return a.subarray(0,k);}
let pr,u={};
try{
 const sh=(t,s)=>{const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);if(!gl.getShaderParameter(x,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(x));return x;};
 pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);
 if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(pr));
 gl.useProgram(pr);
}catch(e){st.textContent='Shader error: '+e.message;return;}
['uRes','uR','uOvW','uShade','uC','uE','uN','uBg','uOcean','uBorder','uInk','uRiver','uOv','uMode'].forEach(n=>u[n]=gl.getUniformLocation(pr,n));
gl.uniform1i(u.uId,0);gl.uniform1i(u.uPal,1);gl.uniform1i(u.uOv,2);
let pg;const ug={};
try{pg=mkProg(VS2,FS2);}catch(e){st.textContent='Line shader error: '+e.message;return;}
['uRes','uR','uW','uC','uE','uN','uCol'].forEach(n=>ug[n]=gl.getUniformLocation(pg,n));
function mkLines(){const vao=gl.createVertexArray(),buf=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buf);
 [['aA',0],['aB',12]].forEach(([n,off])=>{const l=gl.getAttribLocation(pg,n);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,3,gl.FLOAT,false,24,off);gl.vertexAttribDivisor(l,1);});
 gl.bindVertexArray(null);return {vao,buf,n:0};}
function setLines(o,arr){gl.bindBuffer(gl.ARRAY_BUFFER,o.buf);gl.bufferData(gl.ARRAY_BUFFER,arr,gl.DYNAMIC_DRAW);o.n=arr.length/6;}
const BL=mkLines(),HL=mkLines(),LO=mkLines(),GRL=mkLines(),RV=[mkLines(),mkLines(),mkLines()],RZ=[0,2,4],RW=[1.5,1.1,.8];let hlId=-1;
setLines(BL,segs(topojson.mesh(topo,topo.objects.countries,(a,b)=>a===b||a.properties.name!==b.properties.name).coordinates));
function updHover(){if(!HS.outline){HL.n=0;hlId=-1;return;}if(hover===hlId)return;hlId=hover;if(!hover){HL.n=0;return;}
 const nm=feats[hover-1].properties.name,gs=topo.objects.countries.geometries.filter(g=>g.properties&&g.properties.name===nm);
 setLines(HL,segs(topojson.mesh(topo,{type:'GeometryCollection',geometries:gs},(a,b)=>a===b||a.properties.name!==b.properties.name).coordinates));}
gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
(()=>{const a=[],add=(o1,a1,o2,a2)=>a.push(...V(o1,a1),...V(o2,a2));
 for(let lo=-180;lo<180;lo+=10)for(let la=-90;la<90;la+=2)add(lo,la,lo,la+2);
 for(let la=-80;la<=80;la+=10)for(let lo=-180;lo<180;lo+=2)add(lo,la,lo+2,la);
 setLines(GRL,new Float32Array(a));})();
function mk(unit,wrap,filt){const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filt);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filt===gl.NEAREST?gl.NEAREST:gl.LINEAR);return t;}
mk(0,gl.CLAMP_TO_EDGE,gl.NEAREST);mk(1,gl.CLAMP_TO_EDGE,gl.NEAREST);mk(2,gl.REPEAT,gl.LINEAR_MIPMAP_LINEAR);
const pal=new Uint8Array(256*4);
gl.activeTexture(gl.TEXTURE1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,1,0,gl.RGBA,gl.UNSIGNED_BYTE,pal);

const VS3=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
in vec2 aLL;in uint aId;uniform vec2 uRes;uniform float uR;uniform vec3 uC,uE,uN,uLand;uniform sampler2D uPal;uniform int uHover;uniform float uDark;uniform vec4 uFlat;
flat out vec3 vCol;out float vZ;
void main(){
 float lo=aLL.x*0.017453292,la=aLL.y*0.017453292;float c=cos(la);vec3 P=vec3(c*cos(lo),c*sin(lo),sin(la));
 vec3 v=vec3(dot(P,uE),dot(P,uN),dot(P,uC));
 vec3 cc=uFlat.rgb;if(uFlat.a<.5){vec4 pc=texelFetch(uPal,ivec2(int(aId),0),0);cc=pc.a>.5?pc.rgb:uLand;if(int(aId)==uHover){float lu=dot(cc,vec3(.299,.587,.114));cc=lu>.45?cc*(1.-uDark):mix(cc,vec3(1.),uDark);}}vCol=cc;vZ=v.z;
 gl_Position=vec4(((uRes*.5+v.xy*uR)/uRes)*2.-1.,0.,1.);
}`;
const FS3=`#version 300 es
precision highp float;flat in vec3 vCol;in float vZ;out vec4 o;
void main(){if(vZ<0.)discard;o=vec4(vCol,1.);}`;
let pf;const upf={};
try{pf=mkProg(VS3,FS3);}catch(e){st.textContent='Fill shader error: '+e.message;return;}
['uRes','uR','uC','uE','uN','uLand','uPal','uHover','uDark','uFlat'].forEach(n=>upf[n]=gl.getUniformLocation(pf,n));
gl.useProgram(pf);gl.uniform1i(upf.uPal,1);gl.useProgram(pr);
const TV={vao:gl.createVertexArray(),n:0},LK={vao:gl.createVertexArray(),n:0},AID=gl.getAttribLocation(pf,'aId');
function unwrapRing(ring,ref){const out=[];let off=0,prev=ring[0][0];for(const p of ring){let x=p[0]+off;while(x-prev>180){off-=360;x-=360;}while(prev-x>180){off+=360;x+=360;}prev=x;out.push([x,p[1]]);}
 {const F=out[0],Lp=out[out.length-1];if(Math.abs(Lp[0]-F[0])>180){const pole=(F[1]+Lp[1])<0?-90:90;out.push([Lp[0],pole],[F[0],pole]);}}
 if(ref!==undefined){const d=Math.round((ref-out[0][0])/360);if(d)for(const p of out)p[0]+=360*d;}return out;}
function unwrapPoly(poly){const o=unwrapRing(poly[0]);return [o].concat(poly.slice(1).map(r=>unwrapRing(r,o[0][0])));}
const PL=[];
feats.forEach((f,i)=>{const g=f.geometry;(g.type==='Polygon'?[g.coordinates]:g.coordinates).forEach(rp=>{
 const poly=unwrapPoly(rp);let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
 for(const k of poly[0]){x0=Math.min(x0,k[0]);x1=Math.max(x1,k[0]);y0=Math.min(y0,k[1]);y1=Math.max(y1,k[1]);}
 PL.push({id:nameId.get(f.properties.name),bb:[x0,y0,x1,y1],poly});});});
function inRing(r,x,y){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
function idAtLL(x,y){for(const p of PL){const b=p.bb;if(y<b[1]||y>b[3])continue;let xx=x;
 if(xx<b[0]&&xx+360<=b[2])xx+=360;else if(xx>b[2]&&xx-360>=b[0])xx-=360;
 if(xx<b[0]||xx>b[2]||!inRing(p.poly[0],xx,y))continue;
 let h=false;for(let k=1;k<p.poly.length;k++)if(inRing(p.poly[k],xx,y)){h=true;break;}
 if(!h)return p.id;}return 0;}
async function loadPhys(){
 const bin=Uint8Array.from(atob($('phys').textContent.trim()),c=>c.charCodeAt(0));
 const buf=await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
 const [nLV,nLI,nRP,nRG,nVP,nVL,t0,t1]=new Uint32Array(buf,0,8);let off=32;
 const take=n=>{const a=new Int32Array(buf,off,n);off+=4*n;return a;};
 const lq=take(2*nLV),li=take(nLI),rq=take(2*nRP),rl=take(nRG),vq=take(2*nVP),vl=take(nVL);
 const dec=(q,n)=>{const o=new Float32Array(2*n);let x=0,y=0;for(let i=0;i<n;i++){x+=q[2*i];y+=q[2*i+1];o[2*i]=x/1e5;o[2*i+1]=y/1e5;}return o;};
 const ll=dec(lq,nLV),idx=new Uint32Array(nLI);let p=0;for(let i=0;i<nLI;i++){p+=li[i];idx[i]=p;}
 gl.bindVertexArray(LK.vao);
 let b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,ll,gl.STATIC_DRAW);
 const l=gl.getAttribLocation(pf,'aLL');gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,2,gl.FLOAT,false,0,0);
 b=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);
 gl.bindVertexArray(null);LK.n=nLI;
 const segsFrom=(pts,lens,from,to)=>{let st0=0;for(let i=0;i<from;i++)st0+=lens[i];
  let cnt=0;for(let i=from;i<to;i++)cnt+=Math.max(0,lens[i]-1);
  const a=new Float32Array(cnt*6);let k=0,pi=st0;
  for(let i=from;i<to;i++){const n=lens[i];for(let m=1;m<n;m++){a.set(V(pts[2*(pi+m-1)],pts[2*(pi+m-1)+1]),k);a.set(V(pts[2*(pi+m)],pts[2*(pi+m)+1]),k+3);k+=6;}pi+=n;}
  return a;};
 const rp=dec(rq,nRP),vp=dec(vq,nVP);
 setLines(LO,segsFrom(rp,rl,0,nRG));
 setLines(RV[0],segsFrom(vp,vl,0,t0));setLines(RV[1],segsFrom(vp,vl,t0,t0+t1));setLines(RV[2],segsFrom(vp,vl,t0+t1,nVL));
}
async function loadTris(){
 if(typeof DecompressionStream==='undefined')throw new Error('this browser is too old (no DecompressionStream)');
 const bin=Uint8Array.from(atob($('tris').textContent.trim()),c=>c.charCodeAt(0));
 const buf=await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
 const h=new Uint32Array(buf,0,2),nv=h[0],ni=h[1],q=new Int32Array(buf,8,2*nv);
 let off=8+8*nv;const ids=new Uint8Array(buf,off,nv);off+=(nv+3)&~3;const di=new Int32Array(buf,off,ni);
 const ll=new Float32Array(2*nv);let ax=0,ay=0;for(let i=0;i<nv;i++){ax+=q[2*i];ay+=q[2*i+1];ll[2*i]=ax/1e5;ll[2*i+1]=ay/1e5;}
 const idx=new Uint32Array(ni);let p=0;for(let i=0;i<ni;i++){p+=di[i];idx[i]=p;}
 gl.bindVertexArray(TV.vao);
 let b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,ll,gl.STATIC_DRAW);
 let l=gl.getAttribLocation(pf,'aLL');gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,2,gl.FLOAT,false,0,0);
 b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,ids,gl.STATIC_DRAW);
 l=gl.getAttribLocation(pf,'aId');gl.enableVertexAttribArray(l);gl.vertexAttribIPointer(l,1,gl.UNSIGNED_BYTE,0,0);
 b=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);
 gl.bindVertexArray(null);TV.n=ni;
}
function lum(h){const c=hx(h).map(v=>v/255);return .299*c[0]+.587*c[1]+.114*c[2];}
function applyS(){T.bg=S.bg;T.ocean=S.water;T.land=S.land;T.border=S.border;T.river=S.river;T.ink=S.grat;T.label=S.label;
 T.hl=lum(S.water)>.5?'#111111':'#ffffff';T.halo=lum(S.label)>.5?'#101820':'#ffffff';T.panel='#ffffff';T.line='#d7dde3';redraw();}
function render(){
 const a=-rot[0]*D,b=-rot[1]*D,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),R=Rb()*dpr;
 const C=[cb*ca,cb*sa,sb],E=[-sa,ca,0],N=[-sb*ca,-sb*sa,cb],cl=k=>hx(T[k]).map(v=>v/255);
 gl.viewport(0,0,cv.width,cv.height);gl.bindVertexArray(null);
 gl.useProgram(pr);
 gl.uniform2f(u.uRes,cv.width,cv.height);gl.uniform1f(u.uR,R);gl.uniform1f(u.uOvW,4096);gl.uniform1f(u.uShade,S.shade);
 gl.uniform3f(u.uC,...C);gl.uniform3f(u.uE,...E);gl.uniform3f(u.uN,...N);
 [['uBg','bg'],['uOcean','ocean'],['uBorder','border'],['uInk','ink'],['uRiver','river']].forEach(([n,k])=>gl.uniform3f(u[n],...cl(k)));
 const full=m=>{gl.useProgram(pr);gl.uniform1i(u.uMode,m);gl.drawArrays(gl.TRIANGLES,0,3);};
 full(0);
 gl.useProgram(pf);
 gl.uniform2f(upf.uRes,cv.width,cv.height);gl.uniform1f(upf.uR,R);
 gl.uniform3f(upf.uC,...C);gl.uniform3f(upf.uE,...E);gl.uniform3f(upf.uN,...N);gl.uniform3f(upf.uLand,...cl('land'));gl.uniform1i(upf.uHover,hover);gl.uniform1f(upf.uDark,HS.dark?HS.amt:0);gl.uniform4f(upf.uFlat,0,0,0,0);
 gl.bindVertexArray(TV.vao);gl.drawElements(gl.TRIANGLES,TV.n,gl.UNSIGNED_INT,0);gl.bindVertexArray(null);
 if(L.lakes&&LK.n){gl.uniform4f(upf.uFlat,...cl('ocean'),1);gl.vertexAttribI4ui(AID,0,0,0,1);gl.bindVertexArray(LK.vao);gl.drawElements(gl.TRIANGLES,LK.n,gl.UNSIGNED_INT,0);gl.bindVertexArray(null);gl.uniform4f(upf.uFlat,0,0,0,0);}
 gl.useProgram(pg);
 gl.uniform2f(ug.uRes,cv.width,cv.height);gl.uniform1f(ug.uR,R);
 gl.uniform3f(ug.uC,...C);gl.uniform3f(ug.uE,...E);gl.uniform3f(ug.uN,...N);
 const lc=cl('river'),gc=cl('ink');
 if(L.grat&&GRL.n){gl.uniform1f(ug.uW,1*dpr);gl.uniform4f(ug.uCol,gc[0],gc[1],gc[2],.3);gl.bindVertexArray(GRL.vao);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,GRL.n);}
 if(L.lakes&&LO.n){gl.uniform1f(ug.uW,.9*dpr);gl.uniform4f(ug.uCol,lc[0],lc[1],lc[2],.9);gl.bindVertexArray(LO.vao);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,LO.n);}
 if(L.rivers)RV.forEach((r,i)=>{if(r.n&&zoom>=RZ[i]){gl.uniform1f(ug.uW,RW[i]*dpr);gl.uniform4f(ug.uCol,lc[0],lc[1],lc[2],.95);gl.bindVertexArray(r.vao);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,r.n);}});
 if(L.borders&&BL.n){const c=cl('border');gl.uniform1f(ug.uW,S.bw*dpr);gl.uniform4f(ug.uCol,c[0],c[1],c[2],.95);gl.bindVertexArray(BL.vao);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,BL.n);}
 full(4);gl.useProgram(pg);
 if(HS.outline&&hover&&HL.n){const c=cl('hl');gl.uniform1f(ug.uW,2.4*dpr);gl.uniform4f(ug.uCol,c[0],c[1],c[2],1);gl.bindVertexArray(HL.vao);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,HL.n);}
 gl.bindVertexArray(null);
 oc.setTransform(1,0,0,1,0,0);oc.clearRect(0,0,ov.width,ov.height);oc.setTransform(dpr,0,0,dpr,0,0);
 drawRegions(oc,true);if(L.names)drawNames(oc);
}
// ---- custom regions (drawn on the 2D overlay with d3's spherical clipping)
const setProj=()=>proj.translate([W/2,H/2]).scale(Rb()).rotate([rot[0],rot[1],0]);
function geoAt(x,y){setProj();const R=Rb(),dx=x-W/2,dy=y-H/2;if(dx*dx+dy*dy>R*R*.9999)return null;const g=proj.invert([x,y]);return g&&g.every(Number.isFinite)?g:null;}
const onFront=g=>d3.geoDistance(g,[-rot[0],-rot[1]])<Math.PI/2-1e-3;
function rgGeo(pts){const ring=pts.concat([pts[0]]);let g={type:'Polygon',coordinates:[ring]};
 if(d3.geoArea(g)>2*Math.PI)g={type:'Polygon',coordinates:[ring.slice().reverse()]};return g;}
const darker=c=>d3.color(c).darker(.9).formatHex();
function drawRegions(c,ui){
 setProj();const path=d3.geoPath(proj,c);
 if(L.regions)RG.forEach(r=>{if(r.pts.length<3)return;c.beginPath();path(rgGeo(r.pts));
  c.globalAlpha=r.op;c.fillStyle=r.col;c.fill();c.globalAlpha=1;
  c.setLineDash(r.dash?[7,5]:[]);c.lineWidth=r.lw;c.lineJoin='round';c.strokeStyle=darker(r.col);if(r.lw>0)c.stroke();c.setLineDash([]);});
 if(!ui)return;
 const dot=(g,rad,fill)=>{if(!onFront(g))return;const p=proj(g);c.beginPath();c.arc(p[0],p[1],rad,0,7);c.fillStyle=fill;c.fill();c.lineWidth=1.5;c.strokeStyle='#1b2430';c.stroke();};
 const r=RG[rgSel];
 if(r&&!drawing){c.beginPath();path({type:'LineString',coordinates:r.pts.concat([r.pts[0]])});c.lineWidth=2;c.strokeStyle='#ffffff';c.setLineDash([4,3]);c.stroke();c.setLineDash([]);
  r.pts.forEach((g,i)=>{dot(d3.geoInterpolate(g,r.pts[(i+1)%r.pts.length])(.5),3.5,'rgba(255,255,255,.7)');});
  r.pts.forEach(g=>dot(g,5.5,'#ffffff'));}
 if(drawing){const pts=drawing.pts.slice(),m=geoAt(mx,my);
  if(pts.length){c.beginPath();path({type:'LineString',coordinates:m?pts.concat([m]):pts});c.lineWidth=2;c.strokeStyle=drawing.col;c.stroke();}
  pts.forEach((g,i)=>dot(g,i===0&&pts.length>2?7:5,i===0?drawing.col:'#ffffff'));}
}
// hit test against the selected region's handles: {v:i} vertex or {m:i} edge midpoint
function rgHit(x,y){const r=RG[rgSel];if(!r||drawing)return null;setProj();
 const near=g=>{if(!onFront(g))return false;const p=proj(g);return Math.hypot(p[0]-x,p[1]-y)<9;};
 for(let i=0;i<r.pts.length;i++)if(near(r.pts[i]))return {v:i};
 for(let i=0;i<r.pts.length;i++)if(near(d3.geoInterpolate(r.pts[i],r.pts[(i+1)%r.pts.length])(.5)))return {m:i};
 return null;}
function regionAt(x,y){const g=geoAt(x,y);if(!g||!L.regions)return -1;for(let i=RG.length-1;i>=0;i--)if(RG[i].pts.length>2&&d3.geoContains(rgGeo(RG[i].pts),g))return i;return -1;}
function drawNames(c){
 proj.translate([W/2,H/2]).scale(Rb()).rotate([rot[0],rot[1],0]);
 const R=proj.scale(),cen=[-rot[0],-rot[1]],rects=[];
 c.font='600 11px system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';c.lineWidth=3;
 for(const l of LB){
  if(d3.geoDistance(l.c,cen)>1.15)continue;
  const w=c.measureText(l.n).width;if(Math.sqrt(l.a)*R<w*.8)continue;
  const p=proj(l.c);if(!p)continue;
  const x0=p[0]-w/2-2,y0=p[1]-8,x1=p[0]+w/2+2,y1=p[1]+8;
  if(rects.some(r=>x0<r[2]&&x1>r[0]&&y0<r[3]&&y1>r[1]))continue;
  rects.push([x0,y0,x1,y1]);
  c.strokeStyle=T.halo;c.globalAlpha=.85;c.strokeText(l.n,p[0],p[1]);c.globalAlpha=1;c.fillStyle=T.label;c.fillText(l.n,p[0],p[1]);
 }
}
function drawLegend(c,w,h){
 if(!LG.show)return;
 const cnt={};fills.forEach(col=>cnt[col]=1);
 const items=ordCols(cnt).map(col=>({col,label:(labels[col]||'').trim()})).filter(x=>x.label);
 if(L.regions)RG.forEach(r=>{if(r.label.trim()&&r.pts.length>2)items.push({col:r.col,label:r.label.trim(),reg:r});});
 if(!items.length)return;
 const title=LG.title.trim();
 c.textAlign='left';c.textBaseline='middle';
 c.font='14px system-ui,sans-serif';let mw=0;items.forEach(x=>mw=Math.max(mw,c.measureText(x.label).width+26));
 if(title){c.font='600 14px system-ui,sans-serif';mw=Math.max(mw,c.measureText(title).width);}
 const p=12,lh=24,th=title?26:0,bw=mw+p*2,bh=items.length*lh+p*2-6+th,
  bx=LG.pos[1]==='r'?w-bw-16:16,by=LG.pos[0]==='t'?16:h-bh-16;
 c.fillStyle=T.panel;c.fillRect(bx,by,bw,bh);c.strokeStyle=T.line;c.lineWidth=1;c.strokeRect(bx,by,bw,bh);
 c.fillStyle='#1b2430';
 if(title){c.font='600 14px system-ui,sans-serif';c.fillText(title,bx+p,by+p+6);}
 c.font='14px system-ui,sans-serif';
 items.forEach((x,i)=>{const y=by+p+th+i*lh;c.globalAlpha=x.reg?Math.max(.15,x.reg.op):1;c.fillStyle=x.col;c.fillRect(bx+p,y,16,16);c.globalAlpha=1;
  if(x.reg){c.setLineDash(x.reg.dash?[3,2]:[]);c.lineWidth=Math.max(1,Math.min(2,x.reg.lw));c.strokeStyle=darker(x.col);}else{c.lineWidth=1;c.strokeStyle='rgba(0,0,0,.25)';}c.strokeRect(bx+p,y,16,16);c.setLineDash([]);c.fillStyle='#1b2430';c.fillText(x.label,bx+p+26,y+8);});
}
// legend order: remembered order first, new colors appended
function ordCols(cnt){const o=LG.order.filter(c=>cnt[c]);Object.keys(cnt).forEach(c=>{if(!o.includes(c))o.push(c);});LG.order=o;return o;}
let q=0;
function redraw(){if(q)return;q=requestAnimationFrame(()=>{q=0;if(ready)render();});}
function fit(){W=stage.clientWidth;H=stage.clientHeight;dpr=Math.min(window.devicePixelRatio||1,2);
 [cv,ov].forEach(c=>{c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);c.style.width=W+'px';c.style.height=H+'px';});redraw();}
new ResizeObserver(fit).observe(stage);
function idFromQ(x,y){const r2=x*x+y*y;if(r2>1)return 0;const z=Math.sqrt(1-r2),a=-rot[0]*D,b=-rot[1]*D,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
 const wx=z*cb*ca-x*sa-y*sb*ca,wy=z*cb*sa+x*ca-y*sb*sa,wz=z*sb+y*cb;
 return idAtLL(Math.atan2(wy,wx)/D,Math.asin(Math.max(-1,Math.min(1,wz)))/D);}
const idAtPx=(x,y)=>{const R=Rb();return idFromQ((x-W/2)/R,-(y-H/2)/R);};
const idAtEv=e=>{const r=cv.getBoundingClientRect();return idAtPx(e.clientX-r.left,e.clientY-r.top);};
function track(e){const r=cv.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top;}
function placeTip(){if(tip.hidden)return;const w=tip.offsetWidth,h=tip.offsetHeight;let x=mx+14,y=my+18;
 if(x+w>W-4)x=mx-w-10;if(y+h>H-4)y=my-h-10;tip.style.transform='translate('+Math.max(2,x)+'px,'+Math.max(2,y)+'px)';}
function setTip(){const nm=hover?feats[hover-1].properties.name:'';sr.textContent=nm;
 if(HS.tip&&nm){tip.textContent=nm;tip.hidden=false;placeTip();}else tip.hidden=true;}
function setHover(id){if(id===hover)return;hover=id;setTip();updHover();redraw();}
function setFill(n,col){const i=nameId.get(n);
 if(col){fills.set(n,col);const c=hx(col);pal[i*4]=c[0];pal[i*4+1]=c[1];pal[i*4+2]=c[2];pal[i*4+3]=255;}
 else{fills.delete(n);pal[i*4+3]=0;}
 gl.activeTexture(gl.TEXTURE1);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,256,1,gl.RGBA,gl.UNSIGNED_BYTE,pal);}
const snap=()=>({f:new Map(fills),r:JSON.stringify(RG)});
let hist=[{f:new Map(),r:'[]'}],hix=0,cmT=0;
function uiHist(){$('un').disabled=hix<=0;$('re').disabled=hix>=hist.length-1;}
function commit(){clearTimeout(cmT);cmT=0;hist.length=hix+1;hist.push(snap());if(hist.length>200)hist.shift();hix=hist.length-1;uiHist();}
function stroke(){clearTimeout(cmT);cmT=setTimeout(commit,400);}
function applySnap(sn){const m=sn.f;RG.splice(0,RG.length,...JSON.parse(sn.r));if(rgSel>=RG.length)rgSel=-1;drawing=null;renderRegions();[...fills.keys()].forEach(n=>{if(!m.has(n))setFill(n,null);});m.forEach((c,n)=>{if(fills.get(n)!==c)setFill(n,c);});renderLegend();redraw();uiHist();}
function undo(){if(cmT)commit();if(hix>0){hix--;applySnap(hist[hix]);}}
function redo(){if(cmT)commit();if(hix<hist.length-1){hix++;applySnap(hist[hix]);}}
function toggle(id){const n=feats[id-1].properties.name;setFill(n,fills.get(n)===active?null:active);renderLegend();redraw();commit();}
let pl=null;
function paintAt(e){const r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,a=pl||[x,y];
 const n=Math.max(1,Math.min(40,Math.ceil(Math.hypot(x-a[0],y-a[1])/3)));let ch=false;
 for(let s=1;s<=n;s++){const id=idAtPx(a[0]+(x-a[0])*s/n,a[1]+(y-a[1])*s/n);
  if(id){const nm=feats[id-1].properties.name;if(fills.get(nm)!==active){setFill(nm,active);ch=true;}}}
 pl=[x,y];const id=idAtPx(x,y);mx=x;my=y;if(id!==hover){hover=id;updHover();}setTip();
 if(ch){renderLegend();stroke();}redraw();}
const painting=e=>e.ctrlKey||e.metaKey||$('pm').checked;
const curs=on=>{cv.style.cursor=on?'crosshair':'';};
addEventListener('keydown',e=>{if(e.key==='Control'||e.key==='Meta')curs(true);});
addEventListener('keyup',e=>{if(e.key==='Control'||e.key==='Meta'){pl=null;curs($('pm').checked);}});
addEventListener('blur',()=>curs($('pm').checked));
$('pm').onchange=e=>curs(e.target.checked);
cv.addEventListener('contextmenu',e=>{if(e.ctrlKey||rgSel>=0||drawing)e.preventDefault();});
function setZoom(z){zoom=Math.max(.8,Math.min(z,40));redraw();}
const ptrs=new Map();let moved=0,pinched=false,pd=0;
const dist=()=>{const a=[...ptrs.values()];return Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]);};
cv.addEventListener('pointerdown',e=>{if(!ready)return;track(e);cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,[e.clientX,e.clientY]);
 if(ptrs.size===1){moved=0;pinched=false;
  if(rgSel>=0&&!drawing){const h=rgHit(mx,my);if(h){const r=RG[rgSel];
   if(h.v!==undefined&&(e.button===2||e.altKey)){if(r.pts.length>3){r.pts.splice(h.v,1);renderRegions();redraw();commit();}else note('A region needs at least 3 points.',1);moved=99;return;}
   if(h.m!==undefined){r.pts.splice(h.m+1,0,d3.geoInterpolate(r.pts[h.m],r.pts[(h.m+1)%r.pts.length])(.5));rgDrag=h.m+1;}else rgDrag=h.v;
   moved=99;redraw();return;}}
  if(!drawing&&rgSel<0&&painting(e)){paintAt(e);moved=99;}}
 if(ptrs.size===2){pinched=true;pd=dist();}});
cv.addEventListener('pointermove',e=>{
 if(!ready)return;
 if(!ptrs.has(e.pointerId)){if(e.pointerType==='mouse'){track(e);if(drawing||rgSel>=0){setHover(0);redraw();}else if(e.ctrlKey||e.metaKey)paintAt(e);else{setHover(idAtEv(e));placeTip();}}return;}
 const p=ptrs.get(e.pointerId),dx=e.clientX-p[0],dy=e.clientY-p[1];
 ptrs.set(e.pointerId,[e.clientX,e.clientY]);
 if(ptrs.size===2){const n=dist();if(pd)setZoom(zoom*n/pd);pd=n;return;}
 if(rgDrag!==null){track(e);const g=geoAt(mx,my);if(g){RG[rgSel].pts[rgDrag]=g;redraw();}return;}
 if(!drawing&&rgSel<0&&painting(e)){paintAt(e);return;}
 if(hover)setHover(0);
 moved+=Math.abs(dx)+Math.abs(dy);
 const k=57.3/Rb();
 rot=[rot[0]+dx*k,Math.max(-90,Math.min(90,rot[1]-dy*k))];redraw();
});
const up=e=>{pl=null;if(!ptrs.has(e.pointerId))return;const one=ptrs.size===1;ptrs.delete(e.pointerId);if(ptrs.size<2)pd=0;
 if(rgDrag!==null){rgDrag=null;commit();redraw();return;}
 if(one&&!pinched&&moved<6&&e.type==='pointerup'){track(e);
  if(drawing){addPoint(mx,my);return;}
  if(rgSel>=0){const i=regionAt(mx,my);if(i!==rgSel)selectRegion(i);return;}
  const id=idAtEv(e);if(id)toggle(id);}
 if(drawing||rgSel>=0)return;
 if(one&&e.type==='pointerup'){track(e);setHover(idAtEv(e));placeTip();if(e.pointerType!=='mouse'){clearTimeout(tt);tt=setTimeout(()=>setHover(0),1800);}}};
cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
cv.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')setHover(0);});
cv.addEventListener('wheel',e=>{e.preventDefault();track(e);setZoom(zoom*Math.exp(-e.deltaY*0.0015));setHover(idAtPx(mx,my));placeTip();},{passive:false});
$('zi').onclick=()=>setZoom(zoom*1.4);$('zo').onclick=()=>setZoom(zoom/1.4);
$('rv').onclick=()=>{zoom=1;animate(HOME);};
function animate(target){const a=rot.slice(),t0=performance.now(),dl=((target[0]-a[0]+540)%360)-180;
 (function step(t){const k=Math.min(1,(t-t0)/700),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
  rot=[a[0]+dl*e,a[1]+(target[1]-a[1])*e];redraw();if(k<1)requestAnimationFrame(step);})(t0);}
const COLORS=['#e4572e','#f2a541','#f6d743','#7cc06b','#2a9d8f','#3d8bd9','#5b5fc7','#a05cc7','#d6539f','#7a6a5b'];
const pal2=$('pal'),cc=document.createElement('input');
cc.type='color';cc.id='cc';cc.value=active;cc.title='Custom color';cc.setAttribute('aria-label','Custom color');
function mark(){pal2.querySelectorAll('.sw').forEach(b=>b.classList.toggle('on',b.dataset.c===active));}
COLORS.forEach(col=>{const b=document.createElement('button');b.className='sw';b.dataset.c=col;b.style.background=col;b.setAttribute('aria-label','Paint with '+col);b.onclick=()=>{active=col;cc.value=col;mark();};pal2.appendChild(b);});
cc.oninput=()=>{active=cc.value;mark();};pal2.appendChild(cc);mark();
const names=[...new Set(feats.map(f=>f.properties.name))].sort();
$('names').innerHTML=names.map(n=>'<option value="'+n.replace(/"/g,'&quot;')+'">').join('');
function find(s){s=s.trim().toLowerCase();if(!s)return -1;const nm=f=>f.properties.name.toLowerCase();
 let i=feats.findIndex(f=>nm(f)===s);if(i<0)i=feats.findIndex(f=>nm(f).startsWith(s));if(i<0)i=feats.findIndex(f=>nm(f).includes(s));return i;}
function go(){const s=$('q').value;if(!s.trim()||!ready)return;const i=find(s);
 if(i<0){st.textContent='No country matches "'+s+'".';return;}
 st.textContent='';const c=d3.geoCentroid(feats[i]);animate([-c[0],Math.max(-90,Math.min(90,-c[1]))]);
 const nm=feats[i].properties.name;if(fills.get(nm)!==active){setFill(nm,active);renderLegend();commit();}$('q').value='';}
$('q').addEventListener('change',go);$('q').addEventListener('keydown',e=>{if(e.key==='Enter')go();});
$('hs').onchange=e=>{const v=e.target.value;HS.dark=v==='dark'||v==='both';HS.outline=v==='outline'||v==='both';hlId=-1;updHover();redraw();};
$('tg').onchange=e=>{HS.tip=e.target.checked;setTip();};
const resolveName=Ecu.matcher(names);
function paintMany(list,col){let ch=false;list.forEach(n=>{if(fills.get(n)!==col){setFill(n,col);ch=true;}});if(ch){renderLegend();redraw();commit();}return ch;}
function report(found,unknown){
 let m='Painted '+found.length+(found.length===1?' country':' countries');
 if(unknown.length)m+='. Not found: '+unknown.slice(0,8).join(', ')+(unknown.length>8?' and '+(unknown.length-8)+' more':'')+'.';
 note(m,!found.length&&unknown.length>0);}
$('blp').onclick=()=>{if(!ready)return;const r=Ecu.parseList($('bl').value,resolveName);if(!r.found.length&&!r.unknown.length){note('Type or paste some country names first.',1);return;}
 paintMany(r.found,active);report(r.found,r.unknown);};
const grp=$('grp');grp.innerHTML='<optgroup label="Groups">'+Object.keys(Ecu.GROUPS).filter(k=>!Ecu.CONTINENTS[k]).map(k=>'<option>'+k+'</option>').join('')+'</optgroup><optgroup label="Continents">'+Object.keys(Ecu.CONTINENTS).map(k=>'<option>'+k+'</option>').join('')+'</optgroup>';
const grpNote=()=>{$('grpn').textContent=Ecu.GROUP_NOTES[grp.value]||'';};grp.onchange=grpNote;grpNote();
$('grpp').onclick=()=>{if(!ready)return;const g=Ecu.GROUPS[grp.value]||[];paintMany(g,active);note(grp.value+': '+g.length+' areas painted.');};
const SCALES={'Blues':d3.interpolateBlues,'Greens':d3.interpolateGreens,'Oranges':d3.interpolateOranges,'Purples':d3.interpolatePurples,'Reds':d3.interpolateReds,'Viridis':d3.interpolateViridis,'Yellow-Orange-Red':d3.interpolateYlOrRd,'Yellow-Green-Blue':d3.interpolateYlGnBu};
$('dpal').innerHTML=Object.keys(SCALES).map(k=>'<option>'+k+'</option>').join('');
$('dn').innerHTML=[3,4,5,6,7,8,9].map(n=>'<option value="'+n+'"'+(n===5?' selected':'')+'>'+n+' classes</option>').join('');
$('dgo').onclick=()=>{if(!ready)return;const r=Ecu.parseData($('dd').value,resolveName);
 if(!r.rows.length){note(r.bad.length?'Could not read "'+r.bad[0]+'". Use: country, value':'Paste some rows first (country, value).',1);return;}
 const vals=r.rows.map(x=>x.value);let b=Ecu.breaks(vals,+$('dn').value,$('dm').value);
 if(b.length<2)b=[vals[0]-1,vals[0]];const k=b.length-1,f=SCALES[$('dpal').value],cols=[];
 for(let i=0;i<k;i++)cols.push(d3.color(f(k===1?.6:.15+.8*i/(k-1))).formatHex());
 const used=new Set();r.rows.forEach(x=>{const i=Ecu.classOf(x.value,b);used.add(i);setFill(x.name,cols[i]);});
 for(let i=0;i<k;i++){labels[cols[i]]=Ecu.fmt(b[i])+' to '+Ecu.fmt(b[i+1]);}
 LG.order=cols.filter((c,i)=>used.has(i));
 renderLegend();redraw();commit();
 let m=r.rows.length+' countries colored in '+used.size+' classes.';
 if(r.unknown.length)m+=' Not found: '+r.unknown.slice(0,6).join(', ')+(r.unknown.length>6?' and '+(r.unknown.length-6)+' more':'')+'.';
 if(r.bad.length)m+=' Skipped '+r.bad.length+' unreadable line'+(r.bad.length>1?'s':'')+'.';
 note(m,r.unknown.length>0||r.bad.length>0);};
const pk={};
[['water','Water'],['land','Land'],['border','Borders'],['bg','Background'],['river','Rivers'],['grat','Graticule'],['label','Names']].forEach(([k,n])=>{
 const l=document.createElement('label'),i=document.createElement('input');i.type='color';i.value=S[k];i.setAttribute('aria-label',n+' color');
 i.oninput=()=>{S[k]=i.value;applyS();};pk[k]=i;l.append(i,document.createTextNode(n));$('cg').appendChild(l);});
function syncUI(){for(const k in pk)pk[k].value=S[k];$('sbw').value=S.bw;$('ssh').value=Math.round(S.shade*100);}
$('pre').onchange=e=>{Object.assign(S,PRE[e.target.value]);syncUI();applyS();};
$('sbw').oninput=e=>{S.bw=+e.target.value;redraw();};
$('ssh').oninput=e=>{S.shade=+e.target.value/100;redraw();};
$('shd').oninput=e=>{HS.amt=+e.target.value/100;redraw();};
$('un').onclick=undo;$('re').onclick=redo;
const KEYS=['water','land','border','bg','river','grat','label'];
function state(){const g={};fills.forEach((c,n)=>{(g[c]=g[c]||[]).push(n);});
 return {v:1,d:'ne10m',f:Object.entries(g).map(([c,n])=>({c,n,l:labels[c]||''})),s:Object.assign({},S),L:Object.assign({},L),
  h:{dark:HS.dark,outline:HS.outline,tip:HS.tip,amt:HS.amt},g:RG.map(r=>({p:r.pts.map(q=>[+q[0].toFixed(4),+q[1].toFixed(4)]),c:r.col,o:r.op,w:r.lw,d:r.dash,l:r.label})),lg:{t:LG.title,p:LG.pos,s:LG.show,o:LG.order.filter(c=>fills.size&&[...fills.values()].includes(c))},r:[+rot[0].toFixed(2),+rot[1].toFixed(2)],z:+zoom.toFixed(2)};}
function apply(o){
 if(!o||typeof o!=='object'||!Array.isArray(o.f))throw new Error('This is not a map file or code.');
 const hexOk=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 [...fills.keys()].forEach(n=>setFill(n,null));for(const k in labels)delete labels[k];
 let skipped=0;
 o.f.forEach(g=>{if(!g||!hexOk(g.c)||!Array.isArray(g.n))return;const c=g.c.toLowerCase();if(g.l)labels[c]=String(g.l).slice(0,60);
  g.n.forEach(n=>{if(nameId.has(n))setFill(n,c);else skipped++;});});
 const s=o.s||{};KEYS.forEach(k=>{if(hexOk(s[k]))S[k]=s[k].toLowerCase();});
 if(Number.isFinite(s.bw))S.bw=clamp(s.bw,.5,3);if(Number.isFinite(s.shade))S.shade=clamp(s.shade,0,1);
 if(o.L)for(const k in L)if(typeof o.L[k]==='boolean')L[k]=o.L[k];
 if(o.h){HS.dark=!!o.h.dark;HS.outline=!!o.h.outline;HS.tip=!!o.h.tip;if(Number.isFinite(o.h.amt))HS.amt=clamp(o.h.amt,.05,.4);}
 RG.length=0;rgSel=-1;drawing=null;
 if(Array.isArray(o.g))o.g.forEach(g=>{if(!g||!Array.isArray(g.p)||!hexOk(g.c))return;
  const pts=g.p.filter(q=>Array.isArray(q)&&q.length===2&&q.every(Number.isFinite)).map(q=>[clamp(q[0],-180,180),clamp(q[1],-90,90)]);
  if(pts.length<3)return;RG.push(newRegion(pts,g.c.toLowerCase(),Number.isFinite(g.o)?clamp(g.o,0,1):.45,Number.isFinite(g.w)?clamp(g.w,0,6):1.8,!!g.d,typeof g.l==='string'?g.l.slice(0,60):''));});
 renderRegions();
 if(o.lg&&typeof o.lg==='object'){LG.title=typeof o.lg.t==='string'?o.lg.t.slice(0,80):'';LG.pos=['tl','tr','bl','br'].includes(o.lg.p)?o.lg.p:'bl';LG.show=o.lg.s!==false;LG.order=Array.isArray(o.lg.o)?o.lg.o.filter(hexOk):[];}
 else{LG.title='';LG.pos='bl';LG.show=true;LG.order=[];}
 $('lt').value=LG.title;$('lp').value=LG.pos;$('ls').checked=LG.show;
 if(Array.isArray(o.r)&&o.r.length===2&&o.r.every(Number.isFinite))rot=[o.r[0],clamp(o.r[1],-90,90)];
 if(Number.isFinite(o.z))zoom=clamp(o.z,.8,40);
 document.querySelectorAll('[data-k]').forEach(i=>{i.checked=!!L[i.dataset.k];});
 $('hs').value=HS.dark&&HS.outline?'both':HS.dark?'dark':HS.outline?'outline':'none';$('tg').checked=HS.tip;$('shd').value=Math.round(HS.amt*100);
 hlId=-1;updHover();syncUI();renderLegend();applyS();commit();return skipped;}
const b64u=u=>{let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const unb64u=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const pipe=async(u,ts)=>new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(ts)).arrayBuffer());
const encode=async()=>'GM1.'+b64u(await pipe(new TextEncoder().encode(JSON.stringify(state())),new CompressionStream('deflate-raw')));
const decode=async c=>{c=c.trim().replace(/^.*[#?&]m=/,'');if(!c.startsWith('GM1.'))throw new Error('Unknown map code.');
 return JSON.parse(new TextDecoder().decode(await pipe(unb64u(c.slice(4)),new DecompressionStream('deflate-raw'))));};
const note=(m,bad)=>{st.textContent=m;st.style.color=bad?'#c0392b':'';};
$('gc').onclick=async()=>{try{const c=await encode();$('mc').value=c;$('mc').select();
 try{await navigator.clipboard.writeText(c);note('Code copied to the clipboard.');}catch(_){note('Code ready. Copy it from the box.');}}catch(e){note('Could not make a code: '+e.message,1);}};
$('uc').onclick=async()=>{try{const k=apply(await decode($('mc').value));note(k?'Loaded. '+k+' name(s) were not found and were skipped.':'Map loaded.');}catch(e){note('Could not read the code: '+e.message,1);}};
$('sf').onclick=async()=>{try{await saveBlob('globe-map.json',new Blob([JSON.stringify(state(),null,1)],{type:'application/json'}));note('');}catch(err){if(!err||err.code!=='declined')note('Could not save the file.',1);}};
$('lf').onclick=()=>$('fi').click();
$('fi').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{const k=apply(JSON.parse(await f.text()));note(k?'Loaded. '+k+' name(s) were skipped.':'Map loaded.');}catch(err){note('Could not read the file: '+err.message,1);}};
let lastS='';
setInterval(()=>{if(!ready)return;try{const s=JSON.stringify(state());if(s!==lastS){localStorage.setItem('globeMap1',s);lastS=s;}}catch(_){}},3000);
addEventListener('keydown',e=>{const t=e.target&&e.target.tagName;if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT')return;
 if(drawing){if(e.key==='Enter'){e.preventDefault();finishDraw();return;}if(e.key==='Escape'){e.preventDefault();cancelDraw();return;}
  if(e.key==='Backspace'){e.preventDefault();drawing.pts.pop();redraw();return;}}
 else if(rgSel>=0&&e.key==='Escape'){selectRegion(-1);return;}
 if(!(e.ctrlKey||e.metaKey))return;const k=e.key.toLowerCase();
 if(k==='z'){e.preventDefault();e.shiftKey?redo():undo();}else if(k==='y'){e.preventDefault();redo();}});
syncUI();
document.querySelectorAll('[data-k]').forEach(i=>{L[i.dataset.k]=i.checked;i.onchange=()=>{L[i.dataset.k]=i.checked;redraw();};});
function recolor(from,to){if(from===to)return;const ns=[];fills.forEach((c,n)=>{if(c===from)ns.push(n);});ns.forEach(n=>setFill(n,to));
 if(labels[from]&&!labels[to])labels[to]=labels[from];delete labels[from];
 const i=LG.order.indexOf(from);if(i>=0){if(LG.order.includes(to))LG.order.splice(i,1);else LG.order[i]=to;}}
function renderLegend(){
 const box=$('lgd');box.textContent='';const cnt={};fills.forEach(c=>cnt[c]=(cnt[c]||0)+1);const cols=ordCols(cnt);
 if(!cols.length){const p=document.createElement('p');p.className='hint';p.style.margin='0';p.textContent='Painted colors appear here. Name a color to add it to the saved image.';box.appendChild(p);return;}
 const btn=(t,label,fn,dis)=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.setAttribute('aria-label',label);b.disabled=!!dis;b.onclick=fn;return b;};
 cols.forEach((col,i)=>{const r=document.createElement('div');r.className='lg';
  const sw=document.createElement('input');sw.type='color';sw.value=col;sw.setAttribute('aria-label','Change color '+col);
  sw.onchange=()=>{recolor(col,sw.value.toLowerCase());renderLegend();redraw();commit();};
  const inp=document.createElement('input');inp.type='text';inp.placeholder='Name this color';inp.value=labels[col]||'';inp.setAttribute('aria-label','Label for '+col);inp.oninput=()=>{labels[col]=inp.value;};
  const n=document.createElement('small');n.textContent=cnt[col];
  const mv=d=>()=>{const j=i+d;[LG.order[i],LG.order[j]]=[LG.order[j],LG.order[i]];renderLegend();};
  const rm=()=>{[...fills.keys()].filter(k=>fills.get(k)===col).forEach(k=>setFill(k,null));renderLegend();redraw();commit();};
  r.append(sw,inp,n,btn('\u2191','Move up',mv(-1),i===0),btn('\u2193','Move down',mv(1),i===cols.length-1),btn('\u00d7','Remove this color from all countries',rm));
  box.appendChild(r);});
}
$('lt').oninput=e=>{LG.title=e.target.value;};$('lp').onchange=e=>{LG.pos=e.target.value;};$('ls').onchange=e=>{LG.show=e.target.checked;};
let rgN=0;
function newRegion(pts,col,op,lw,dash,label){return {id:++rgN,pts,col,op,lw,dash,label};}
function startDraw(){if(!ready)return;selectRegion(-1);drawing={pts:[],col:active};curs(true);renderRegions();redraw();
 note('Click on the globe to add points. Drag to rotate. Click the first point or press Enter to finish; Backspace removes a point; Esc cancels.');}
function cancelDraw(){drawing=null;curs($('pm').checked);renderRegions();redraw();note('');}
function addPoint(x,y){const g=geoAt(x,y);if(!g)return;const P=drawing.pts;setProj();
 if(P.length){const a=proj(P[P.length-1]);if(Math.hypot(a[0]-x,a[1]-y)<7){finishDraw();return;}}
 if(P.length>2&&onFront(P[0])){const a=proj(P[0]);if(Math.hypot(a[0]-x,a[1]-y)<10){finishDraw();return;}}
 P.push(g);redraw();}
function finishDraw(){if(!drawing)return;const P=drawing.pts;
 if(P.length<3){note('A region needs at least 3 points.',1);return;}
 RG.push(newRegion(P,drawing.col,.45,1.8,false,''));drawing=null;curs($('pm').checked);selectRegion(RG.length-1);commit();
 note('Region added. Drag its points to adjust, drag a small dot to add a point, Alt-click or right-click a point to remove it.');
 const inp=document.querySelector('#rgl .rg-row.on input[type=text]');if(inp)inp.focus();}
function selectRegion(i){rgSel=i;if(i<0)curs($('pm').checked);renderRegions();redraw();}
function renderRegions(){
 const box=$('rgl');box.textContent='';$('rgd').textContent=drawing?'Cancel drawing':'Draw a region';$('rgf').hidden=!drawing;
 if(!RG.length){const p=document.createElement('p');p.className='hint';p.style.margin='0';p.textContent='Regions are freehand areas, such as language groups, cultures or climate zones. They sit on top of country colors.';box.appendChild(p);return;}
 const btn=(t,label,fn,dis)=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.setAttribute('aria-label',label);b.title=label;b.disabled=!!dis;b.onclick=fn;return b;};
 RG.forEach((r,i)=>{const row=document.createElement('div');row.className='rg-row'+(i===rgSel?' on':'');
  const top=document.createElement('div');top.className='lg';
  const sw=document.createElement('input');sw.type='color';sw.value=r.col;sw.setAttribute('aria-label','Region color');sw.oninput=()=>{r.col=sw.value.toLowerCase();redraw();};sw.onchange=()=>commit();
  const t=document.createElement('input');t.type='text';t.placeholder='Name (shows in legend)';t.value=r.label;t.setAttribute('aria-label','Region name');t.oninput=()=>{r.label=t.value;};t.onchange=()=>commit();
  const mv=d=>()=>{const j=i+d;[RG[i],RG[j]]=[RG[j],RG[i]];if(rgSel===i)rgSel=j;else if(rgSel===j)rgSel=i;renderRegions();redraw();commit();};
  top.append(sw,t,btn(i===rgSel?'✓':'✎',i===rgSel?'Done editing':'Edit points',()=>{if(drawing)cancelDraw();selectRegion(i===rgSel?-1:i);}),
   btn('↑','Draw below the region after it',mv(-1),i===0),btn('↓','Draw above the region after it',mv(1),i===RG.length-1),
   btn('×','Delete region',()=>{RG.splice(i,1);if(rgSel===i)rgSel=-1;else if(rgSel>i)rgSel--;renderRegions();redraw();commit();}));
  const opt=document.createElement('div');opt.className='rg-opt';
  const op=document.createElement('input');op.type='range';op.min=0;op.max=100;op.value=Math.round(r.op*100);op.setAttribute('aria-label','Fill opacity');op.oninput=()=>{r.op=op.value/100;redraw();};op.onchange=()=>commit();
  const lw=document.createElement('input');lw.type='range';lw.min=0;lw.max=6;lw.step=.2;lw.value=r.lw;lw.setAttribute('aria-label','Outline width');lw.oninput=()=>{r.lw=+lw.value;redraw();};lw.onchange=()=>commit();
  const dl=document.createElement('label'),dc=document.createElement('input');dc.type='checkbox';dc.checked=r.dash;dc.onchange=()=>{r.dash=dc.checked;redraw();commit();};dl.append(dc,document.createTextNode(' Dashed'));
  const l1=document.createElement('label');l1.append('Fill',op);const l2=document.createElement('label');l2.append('Outline',lw);
  opt.append(l1,l2,dl);row.append(top,opt);box.appendChild(row);});
}
$('rgd').onclick=()=>{drawing?cancelDraw():startDraw();};$('rgf').onclick=finishDraw;
let armed=0;
$('clr').onclick=e=>{if(!fills.size)return;
 if(!armed){armed=setTimeout(()=>{armed=0;e.target.textContent='Clear all colors';},3000);e.target.textContent='Click again to clear';return;}
 clearTimeout(armed);armed=0;e.target.textContent='Clear all colors';[...fills.keys()].forEach(n=>setFill(n,null));renderLegend();redraw();commit();};
(async()=>{try{dlc=await window.claude.use('downloads');}catch(_){dlc=null;}})();
async function saveBlob(filename,blob){if(dlc)return dlc.save({filename,data:blob});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);}
$('exp').onclick=async()=>{
 if(!ready)return;
 const k=$('x2').checked?2:1,od=dpr,h=hover;hover=0;dpr=od*k;cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);render();
 const o=document.createElement('canvas');o.width=cv.width;o.height=cv.height;const c=o.getContext('2d');
 c.drawImage(cv,0,0);c.setTransform(dpr,0,0,dpr,0,0);drawRegions(c,false);if(L.names)drawNames(c);drawLegend(c,W,H);
 hover=h;dpr=od;cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);render();
 const blob=await new Promise(r=>o.toBlob(r,'image/png'));
 try{await saveBlob('globe-map.png',blob);st.textContent='';}catch(err){if(!err||err.code!=='declined')st.textContent='Could not save the image.';}
};
applyS();uiHist();
renderLegend();renderRegions();fit();
(async()=>{await new Promise(r=>setTimeout(r,30));await loadTris();await loadPhys();ready=true;ld.hidden=true;try{const s=localStorage.getItem('globeMap1');if(s)apply(JSON.parse(s));}catch(_){}lastS=JSON.stringify(state());redraw();})()
 .catch(e=>{ld.hidden=true;st.textContent='Setup failed: '+e.message;});
})();
