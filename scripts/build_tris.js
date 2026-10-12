const fs=require('fs'),zlib=require('zlib'),tj=require('topojson-client'),earcut=require('earcut');
eval(fs.readFileSync(__dirname+'/../src/tri.js','utf8')+';global.triangulate=triangulate');
(async()=>{
 const t=require('world-atlas/countries-10m.json');
 const feats=tj.feature(t,t.objects.countries).features.filter(f=>f.properties&&f.properties.name);
 const ALIAS={'Baikonur':'Kazakhstan','USNB Guantanamo Bay':'Cuba'};
 feats.forEach(f=>{const a=ALIAS[f.properties.name];if(a)f.properties.name=a;});
 const first=new Map();feats.forEach((f,i)=>{if(!first.has(f.properties.name))first.set(f.properties.name,i+1);});
 const idOf=feats.map(f=>first.get(f.properties.name));
 const STEP=+process.argv[2]||4;
 const t0=Date.now();const r=await triangulate(feats,earcut,STEP,null,idOf);
 const nv=r.id.length,ni=r.idx.length;
 const hdr=new Uint32Array([nv,ni]);
 const q=new Int32Array(2*nv);let px=0,py=0;
 for(let i=0;i<nv;i++){const x=Math.round(r.ll[2*i]*1e5),y=Math.round(r.ll[2*i+1]*1e5);q[2*i]=x-px;q[2*i+1]=y-py;px=x;py=y;}
 const di=new Int32Array(ni);let p=0;for(let i=0;i<ni;i++){di[i]=r.idx[i]-p;p=r.idx[i];}
 const idPad=(nv+3)&~3,ids=new Uint8Array(idPad);ids.set(r.id);
 const buf=Buffer.concat([Buffer.from(hdr.buffer),Buffer.from(q.buffer),Buffer.from(ids.buffer),Buffer.from(di.buffer)]);
 const z=zlib.deflateRawSync(buf,{level:9});
 fs.writeFileSync(__dirname+'/../data/tris.b64',z.toString('base64'));
 let ta=0,pa=0;{const sh=ring=>{let s=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)s+=(ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1]);return Math.abs(s)/2;};for(let i=0;i<ni;i+=3){const a=r.idx[i]*2,b2=r.idx[i+1]*2,c=r.idx[i+2]*2;ta+=Math.abs((r.ll[b2]-r.ll[a])*(r.ll[c+1]-r.ll[a+1])-(r.ll[c]-r.ll[a])*(r.ll[b2+1]-r.ll[a+1]))/2;}for(const p of r.PL){pa+=sh(p.poly[0]);for(let k=1;k<p.poly.length;k++)pa-=sh(p.poly[k]);}}
 console.log('areaRatio',(ta/pa).toFixed(5));
 console.log('STEP',STEP,'ms',Date.now()-t0,'verts',nv,'tris',ni/3,'raw MB',(buf.length/1e6).toFixed(1),'deflated MB',(z.length/1e6).toFixed(2),'b64 MB',(z.length*4/3/1e6).toFixed(2));
 // ll precision check vs float32 path
})();
