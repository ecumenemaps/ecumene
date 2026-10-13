const fs=require('fs'),zlib=require('zlib'),earcut=require('earcut');
eval(fs.readFileSync(__dirname+'/lib/tri.js','utf8')+';global.triangulate=triangulate');
(async()=>{
 const lk=JSON.parse(fs.readFileSync(__dirname+'/../data/src/ne_10m_lakes.geojson')).features.filter(f=>f.geometry);
 const rv=JSON.parse(fs.readFileSync(__dirname+'/../data/src/ne_10m_rivers_lake_centerlines_scale_rank.geojson')).features.filter(f=>f.geometry&&f.properties.featurecla!=='Lake Centerline');
 // Major lakes (Natural Earth scalerank 0-1, the lakes it keeps on world-scale maps) come first so
 // the renderer can draw just them, or everything.
 const major=f=>(f.properties.scalerank??9)<=1;
 lk.sort((a,b)=>major(b)-major(a));const nMaj=lk.filter(major).length;
 const rA=await triangulate(lk.slice(0,nMaj),earcut,4,null,null),rB=await triangulate(lk.slice(nMaj),earcut,4,null,null);
 const nAV=rA.ll.length/2,r={ll:Float32Array.from([...rA.ll,...rB.ll]),id:{length:nAV+rB.ll.length/2},idx:Uint32Array.from([...rA.idx,...Array.from(rB.idx,i=>i+nAV)])};
 const nMajIdx=rA.idx.length;let nMajRings=0;
 lk.forEach((f,fi)=>{if(fi<nMaj){const g=f.geometry;(g.type==='Polygon'?[g.coordinates]:g.coordinates).forEach(p=>nMajRings+=p.length);}});
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
 const secs=[dq(Array.from(r.ll)),li,dq(ringFlat),Int32Array.from(rings.map(x=>x.length)),dq(rivFlat),Int32Array.from(lines.map(x=>x.l.length))];
 const hdr=new Uint32Array([nLV,nLI,nRP,nRG,nVP,nVL,cnt[0],cnt[1],nMajIdx,nMajRings]);
 const buf=Buffer.concat([Buffer.from(hdr.buffer),...secs.map(s=>Buffer.from(s.buffer,s.byteOffset,s.byteLength))]);
 const expect=40+4*(2*nLV+nLI+2*nRP+nRG+2*nVP+nVL);
 const z=zlib.deflateRawSync(buf,{level:9});
 fs.writeFileSync(__dirname+'/../data/phys.bin',z);
 console.log({majorLakes:nMaj,nMajIdx,nMajRings,nLV,nLI,nRP,nRG,nVP,nVL,tiers:cnt,rawMB:(buf.length/1e6).toFixed(2),expectOK:expect===buf.length,deflMB:(z.length/1e6).toFixed(2),b64MB:(z.length*4/3/1e6).toFixed(2)});
})();
