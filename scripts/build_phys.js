const fs=require('fs'),zlib=require('zlib'),earcut=require('earcut');
eval(fs.readFileSync(__dirname+'/lib/tri.js','utf8')+';global.triangulate=triangulate');
(async()=>{
 let lk=JSON.parse(fs.readFileSync(__dirname+'/../data/src/ne_10m_lakes.geojson')).features.filter(f=>f.geometry);
 // Natural Earth stores some water twice: a bay as its own lake on top of its parent, or one lake at two
 // scaleranks. Overlaps show as land in an even-odd SVG fill and draw extra shores across the water, so a lake
 // lying wholly inside another (under 3% of it left after subtracting the other: the bays' outlines run a little outside their parent's shore) is dropped, keeping the
 // better-ranked one of an exact duplicate. The list is checked so a data update cannot change it unnoticed.
 const CONTAINED={
  1159113081:'Georgian Bay, in Lake Huron',1159113071:'North Channel, in Lake Huron',1159113055:'Saginaw Bay, in Lake Huron',
  1159113039:'Whitefish Bay, in Lake Superior',1159110107:'unnamed, Quebec, duplicate',1159110121:'unnamed, Nunavut, duplicate',
  1159110133:'unnamed, Nunavut, duplicate',1159122435:'unnamed, Sweden, duplicate',1159121323:'unnamed, in Lake Chany',
  1159107185:'unnamed, in Reindeer Lake',
 };
 {const pc=require('polygon-clipping');
  const polys=f=>(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).map(p=>p.map(r=>r.map(([x,y])=>[Math.round(x*1e5)/1e5,Math.round(y*1e5)/1e5])));
  // planar area in square degrees scaled by the cosine of latitude; only ratios matter here
  const area=P=>P.reduce((s,p)=>s+p.reduce((t,r,i)=>{let a=0;for(let k=0,j=r.length-1;k<r.length;j=k++)a+=(r[j][0]-r[k][0])*(r[j][1]+r[k][1])*Math.cos(r[k][1]*Math.PI/180);return t+(i?-1:1)*Math.abs(a)/2;},0),0);
  const L=lk.map(f=>{const P=polys(f);let b=[1e9,1e9,-1e9,-1e9];for(const p of P)for(const [x,y] of p[0])b=[Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)];return {f,P,b,a:area(P)};});
  const inside=(A,B)=>{if(A.b[0]<B.b[0]||A.b[1]<B.b[1]||A.b[2]>B.b[2]||A.b[3]>B.b[3])return false;
   try{return area(pc.difference(A.P,B.P))<0.03*A.a;}catch(e){return false;}};
  const rank=x=>[x.f.properties.scalerank??9,x.f.properties.ne_id];
  const worse=(A,B)=>{const a=rank(A),b=rank(B);return a[0]>b[0]||(a[0]===b[0]&&a[1]>b[1]);};
  const drop=new Set();
  for(const A of L)for(const B of L)if(A!==B&&!drop.has(B)&&inside(A,B)&&(!inside(B,A)||worse(A,B))){drop.add(A);break;}
  const got=[...drop].map(x=>x.f.properties.ne_id).sort(),want=Object.keys(CONTAINED).map(Number).sort();
  if(got.join()!==want.join())throw new Error('lakes inside other lakes changed: found '+[...drop].map(x=>x.f.properties.ne_id+' '+(x.f.properties.name||'unnamed')+' @'+x.b.slice(0,2).map(v=>v.toFixed(2))).join('; '));
  lk=lk.filter(f=>!CONTAINED[f.properties.ne_id]);}
 const rv=JSON.parse(fs.readFileSync(__dirname+'/../data/src/ne_10m_rivers_lake_centerlines_scale_rank.geojson')).features.filter(f=>f.geometry&&f.properties.featurecla!=='Lake Centerline');
 // Always water: inland seas that reference maps show as water but Natural Earth ranks below major and the
 // countries layer fills as land. The IJsselmeer (with the Markermeer) is the former Zuiderzee bay, closed in 1932.
 // They are drawn whatever the Lakes setting, with their shore as coast, and clicks there count as sea.
 const SEA=['IJsselmeer'];
 for(const n of SEA)if(!lk.some(f=>f.properties.name===n))throw new Error('lake not found in ne_10m_lakes: '+n);
 // Major lakes are Natural Earth scalerank 0-1, the lakes it keeps on world-scale maps.
 const tier=f=>SEA.includes(f.properties.name)?0:(f.properties.scalerank??9)<=1?1:2;
 // Stored in tier order (always water, major, the rest) so the renderer can draw a prefix.
 lk.sort((a,b)=>tier(a)-tier(b));
 const parts=[0,1,2].map(t=>lk.filter(f=>tier(f)===t)),tr=[];
 for(const p of parts)tr.push(await triangulate(p,earcut,4,null,null));
 const ll=[],idx=[];let nv=0;const idxEnd=[];
 for(const t of tr){for(const v of t.ll)ll.push(v);for(const i of t.idx)idx.push(i+nv);nv+=t.ll.length/2;idxEnd.push(idx.length);}
 const r={ll:Float32Array.from(ll),id:{length:nv},idx:Uint32Array.from(idx)};
 const ringsOf=f=>{const g=f.geometry;let n=0;(g.type==='Polygon'?[g.coordinates]:g.coordinates).forEach(p=>n+=p.length);return n;};
 const nSea=parts[0].length,nMaj=nSea+parts[1].length;
 const nSeaIdx=idxEnd[0],nMajIdx=idxEnd[1];
 let nSeaRings=0,nMajRings=0;
 lk.forEach((f,fi)=>{const n=ringsOf(f);if(fi<nSea)nSeaRings+=n;if(fi<nMaj)nMajRings+=n;});
 const rings=[];lk.forEach(f=>{const g=f.geometry;(g.type==='Polygon'?[g.coordinates]:g.coordinates).forEach(p=>p.forEach(rg=>rings.push(rg)));});
 const tierOf=f=>{const z=f.properties.min_zoom;return z<=3.5?0:z<=5.5?1:2;};
 const lines=[];rv.forEach(f=>{const g=f.geometry;(g.type==='LineString'?[g.coordinates]:g.coordinates).forEach(l=>lines.push({t:tierOf(f),l}));});
 lines.sort((a,b)=>a.t-b.t);const cnt=[0,0,0];lines.forEach(x=>cnt[x.t]++);
 const dq=(flat)=>{const o=new Int32Array(flat.length);let px=0,py=0;for(let i=0;i<flat.length;i+=2){const x=Math.round(flat[i]*1e5),y=Math.round(flat[i+1]*1e5);o[i]=x-px;o[i+1]=y-py;px=x;py=y;}return o;};
 const flatPts=arr=>{const o=[];arr.forEach(l=>l.forEach(p=>o.push(p[0],p[1])));return o;};
 const nLV=r.id.length,nLI=r.idx.length;
 const li=new Int32Array(nLI);{let p=0;for(let i=0;i<nLI;i++){li[i]=r.idx[i]-p;p=r.idx[i];}}
 const ringFlat=flatPts(rings),rivFlat=flatPts(lines.map(x=>x.l));
 const nRP=ringFlat.length/2,nRG=rings.length,nVP=rivFlat.length/2,nVL=lines.length;
 // rings per lake polygon (its shore, then its islands), so the outlines can be put back together as polygons
 const polyRings=[];lk.forEach(f=>{const g=f.geometry;(g.type==='Polygon'?[g.coordinates]:g.coordinates).forEach(p=>polyRings.push(p.length));});
 const nPL=polyRings.length;
 const secs=[dq(Array.from(r.ll)),li,dq(ringFlat),Int32Array.from(rings.map(x=>x.length)),dq(rivFlat),Int32Array.from(lines.map(x=>x.l.length)),Int32Array.from(polyRings)];
 // header: counts, river tiers, major prefix (triangles, rings) including the always-water prefix (triangles, rings),
 // number of lake polygons
 const hdr=new Uint32Array([nLV,nLI,nRP,nRG,nVP,nVL,cnt[0],cnt[1],nMajIdx,nMajRings,nSeaIdx,nSeaRings,nPL]);
 const buf=Buffer.concat([Buffer.from(hdr.buffer),...secs.map(s=>Buffer.from(s.buffer,s.byteOffset,s.byteLength))]);
 const expect=52+4*(2*nLV+nLI+2*nRP+nRG+2*nVP+nVL+nPL);
 const z=zlib.deflateRawSync(buf,{level:9});
 fs.writeFileSync(__dirname+'/../data/phys.bin',z);
 console.log({alwaysWater:nSea,majorLakes:nMaj-nSea,droppedInsideOthers:Object.keys(CONTAINED).length,lakePolys:nPL,nSeaIdx,nSeaRings,nMajIdx,nMajRings,nLV,nLI,nRP,nRG,nVP,nVL,tiers:cnt,rawMB:(buf.length/1e6).toFixed(2),expectOK:expect===buf.length,deflMB:(z.length/1e6).toFixed(2),b64MB:(z.length*4/3/1e6).toFixed(2)});
})();
