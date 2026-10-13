const fs=require('fs'),zlib=require('zlib'),earcut=require('earcut');
eval(fs.readFileSync(__dirname+'/lib/tri.js','utf8')+';global.triangulate=triangulate');
(async()=>{
 const lk=JSON.parse(fs.readFileSync(__dirname+'/../data/src/ne_10m_lakes.geojson')).features.filter(f=>f.geometry);
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
 const secs=[dq(Array.from(r.ll)),li,dq(ringFlat),Int32Array.from(rings.map(x=>x.length)),dq(rivFlat),Int32Array.from(lines.map(x=>x.l.length))];
 // header: counts, river tiers, major prefix (triangles, rings) including the always-water prefix (triangles, rings)
 const hdr=new Uint32Array([nLV,nLI,nRP,nRG,nVP,nVL,cnt[0],cnt[1],nMajIdx,nMajRings,nSeaIdx,nSeaRings]);
 const buf=Buffer.concat([Buffer.from(hdr.buffer),...secs.map(s=>Buffer.from(s.buffer,s.byteOffset,s.byteLength))]);
 const expect=48+4*(2*nLV+nLI+2*nRP+nRG+2*nVP+nVL);
 const z=zlib.deflateRawSync(buf,{level:9});
 fs.writeFileSync(__dirname+'/../data/phys.bin',z);
 console.log({alwaysWater:nSea,majorLakes:nMaj-nSea,nSeaIdx,nSeaRings,nMajIdx,nMajRings,nLV,nLI,nRP,nRG,nVP,nVL,tiers:cnt,rawMB:(buf.length/1e6).toFixed(2),expectOK:expect===buf.length,deflMB:(z.length/1e6).toFixed(2),b64MB:(z.length*4/3/1e6).toFixed(2)});
})();
