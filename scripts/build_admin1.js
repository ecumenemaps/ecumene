// Splits Natural Earth 10m admin-1 (states/provinces) into one small TopoJSON file per country,
// written to data/admin1/<A3>.json, plus data/admin1/index.json mapping map country names to files.
// Run: node scripts/build_admin1.js   (needs data/src/ne_10m_admin_1_states_provinces.geojson; see scripts/fetch_data.js)
const fs=require('fs'),path=require('path'),ts=require('topojson-server'),tj=require('topojson-client');
const R=p=>path.join(__dirname,'..',p);
const src=JSON.parse(fs.readFileSync(R('data/src/ne_10m_admin_1_states_provinces.geojson')));
const {OVERSEAS,splitOverseas}=require('../src/overseas.js');
const world=splitOverseas(require('world-atlas/countries-10m.json'),tj.feature);
const ALIAS={'Baikonur':'Kazakhstan','USNB Guantanamo Bay':'Cuba'};
const mapNames=new Set(tj.feature(world,world.objects.countries).features.filter(f=>f.properties&&f.properties.name).map(f=>ALIAS[f.properties.name]||f.properties.name));
const Ecu=require('../src/groups.js'),resolve=Ecu.matcher([...mapNames]);
// Natural Earth admin-1 'admin' names that differ from the map's country names
const FIX={'United Republic of Tanzania':'Tanzania','Republic of Serbia':'Serbia','The Bahamas':'Bahamas','Federated States of Micronesia':'Micronesia','Republic of the Congo':'Congo','Democratic Republic of the Congo':'Dem. Rep. Congo','Guinea Bissau':'Guinea-Bissau','East Timor':'Timor-Leste','Ivory Coast':"Côte d'Ivoire",'Northern Cyprus':'N. Cyprus','North Macedonia':'Macedonia','Hong Kong S.A.R.':'Hong Kong','Macao S.A.R':'Macao','eSwatini':'eSwatini','Swaziland':'eSwatini','Cape Verde':'Cabo Verde','Faroe Islands':'Faeroe Is.','Aland':'Åland','Curaçao':'Curaçao','Saint Barthelemy':'St-Barthélemy','Saint Martin':'St-Martin','Sao Tome and Principe':'São Tomé and Principe','Czech Republic':'Czechia','Western Sahara':'W. Sahara','Somaliland':'Somaliland','Falkland Islands':'Falkland Is.','French Southern and Antarctic Lands':'Fr. S. Antarctic Lands','South Georgia and the Islands':'S. Geo. and the Is.','Heard Island and McDonald Islands':'Heard I. and McDonald Is.','United States Virgin Islands':'U.S. Virgin Is.','British Virgin Islands':'British Virgin Is.','Northern Mariana Islands':'N. Mariana Is.','Turks and Caicos Islands':'Turks and Caicos Is.','Cayman Islands':'Cayman Is.','Cook Islands':'Cook Is.','Marshall Islands':'Marshall Is.','Solomon Islands':'Solomon Is.','Pitcairn Islands':'Pitcairn Is.','Wallis and Futuna':'Wallis and Futuna Is.','French Polynesia':'Fr. Polynesia','Saint Pierre and Miquelon':'St. Pierre and Miquelon','Saint Kitts and Nevis':'St. Kitts and Nevis','Saint Vincent and the Grenadines':'St. Vin. and Gren.','Antigua and Barbuda':'Antigua and Barb.','Bosnia and Herzegovina':'Bosnia and Herz.','Central African Republic':'Central African Rep.','Dominican Republic':'Dominican Rep.','Equatorial Guinea':'Eq. Guinea','South Sudan':'S. Sudan','Vatican':'Vatican','Saint Helena':'Saint Helena','British Indian Ocean Territory':'Br. Indian Ocean Ter.','Indian Ocean Territories':'Indian Ocean Ter.','United States Minor Outlying Islands':'U.S. Minor Outlying Is.','Ashmore and Cartier Islands':'Ashmore and Cartier Is.','Gaza Strip':'Palestine','West Bank':'Palestine','Macau S.A.R':'Macao','Macao S.A.R':'Macao',
 // enclaves the map merges into the country around them (ALIAS) are units of that country
 'Baykonur Cosmodrome':'Kazakhstan','US Naval Base Guantanamo Bay':'Cuba'};
const byCountry=new Map(),unmatched=new Set(),enclaves=[];
const ENCLAVES=new Set(['Baykonur Cosmodrome','US Naval Base Guantanamo Bay']);
for(const f of src.features){const p=f.properties;if(!f.geometry)continue;
 const name=FIX[p.admin]&&mapNames.has(FIX[p.admin])?FIX[p.admin]:mapNames.has(p.admin)?p.admin:resolve(p.admin);
 if(!name){unmatched.add(p.admin);continue;}
 // enclave units go after the country's own, so the ids of its own units (which saved outlines use) do not move
 if(ENCLAVES.has(p.admin)){enclaves.push([name,f]);continue;}
 if(!byCountry.has(name))byCountry.set(name,{a3:p.adm0_a3,feats:[]});
 byCountry.get(name).feats.push(f);}
for(const [name,f] of enclaves)byCountry.get(name).feats.push(f);
fs.mkdirSync(R('data/admin1'),{recursive:true});
const index={};let total=0;
const clean=v=>typeof v==='string'&&v.trim()&&v!=='null'?v.trim():'';
// Units become features with an id (their position in the country's Natural Earth list, which saved exact outlines
// refer to) and c, Natural Earth's adm1_code, unique and stable, which painted units are saved by.
const units=new Map();
for(const [name,{a3,feats}] of byCountry)units.set(name,{a3,list:feats.map((f,i)=>{const p=f.properties;
 return {type:'Feature',id:i,geometry:f.geometry,properties:{n:clean(p.name_en)||clean(p.name)||('Unit '+(i+1)),c:p.adm1_code,ty:clean(p.type_en),r:clean(p.region),g:clean(p.geonunit)!==clean(p.admin)?clean(p.geonunit):''}};})});
// Overseas parts split from their parent on the map (src/overseas.js) take their units with them; the parent's
// remaining units keep their ids, so outlines saved before the split still find them.
const firstPt=g=>{let c=g.coordinates;while(Array.isArray(c[0]))c=c[0];return c;};
for(const o of OVERSEAS){const P=units.get(o.parent);if(!P)continue;
 const mine=P.list.filter(f=>{const [x,y]=firstPt(f.geometry);return o.boxes.some(b=>x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]);});
 if(!mine.length)continue;
 P.list=P.list.filter(f=>!mine.includes(f));
 // Natural Earth may already list some of the part's units under its own name (Bonaire is "Caribbean Netherlands")
 const E=units.get(o.name)||{list:[]};
 units.set(o.name,{a3:P.a3+o.id,list:E.list.concat(mine).map((f,i)=>Object.assign({},f,{id:i}))});}
const files=new Map();
for(const [name,{a3}] of units){const f=a3.replace(/[^A-Z0-9]/g,'');if(files.has(f))throw new Error('admin1 file '+f+' would hold both '+files.get(f)+' and '+name);files.set(f,name);}
// Parts of a country that no unit covers become one more unit, "Rest of <country>", so every part of it can be
// painted: Natural Earth's admin-1 leaves out the north of Åland's main island and the Southern Patagonian Ice
// Field, for example. Slivers where the two layers' coastlines differ slightly (under 10 km², or under 1 km wide
// on average) are dropped.
const pc=require('polygon-clipping');
const countryPolys=new Map();
for(const f of tj.feature(world,world.objects.countries).features){if(!f.geometry)continue;const n=ALIAS[f.properties.name]||f.properties.name,g=f.geometry;
 if(!countryPolys.has(n))countryPolys.set(n,[]);countryPolys.get(n).push(...(g.type==='Polygon'?[g.coordinates]:g.coordinates));}
const KM=111.32,MIN_KM2=10,MIN_WIDTH_KM=1;
// planar area (km²) and perimeter (km) of a lon/lat ring, scaled by the cosine of its mean latitude
function ringStats(r){const lat=r.reduce((s,q)=>s+q[1],0)/r.length,k=Math.cos(lat*Math.PI/180);let a=0,p=0;
 for(let i=0,j=r.length-1;i<r.length;j=i++){a+=r[j][0]*k*r[i][1]-r[i][0]*k*r[j][1];p+=Math.hypot((r[i][0]-r[j][0])*k,r[i][1]-r[j][1]);}
 return {a:Math.abs(a)/2*KM*KM,p:p*KM};}
// The clipping is planar, so a country that straddles 180° (Russia, Fiji, the US with the Aleutians) gets continuous
// longitudes first: rings are unwrapped and its western-hemisphere pieces moved past 180°, the same for its units.
// d3 and the globe accept longitudes beyond 180°.
function unwrapRing(r){const o=[];let off=0,prev=r[0][0];for(const p of r){let x=p[0]+off;while(x-prev>180){off-=360;x-=360;}while(prev-x>180){off+=360;x+=360;}prev=x;o.push([x,p[1]]);}return o;}
function shiftPoly(P,wrap){const o=P.map(unwrapRing),ref=o[0][0][0];
 for(const r of o.slice(1)){const k=Math.round((ref-r[0][0])/360);if(k)for(const p of r)p[0]+=360*k;} // holes next to their outer ring
 let m=0;for(const p of o[0])m+=p[0];m/=o[0].length;
 if(wrap&&m<0)for(const r of o)for(const p of r)p[0]+=360;
 return o;}
const straddles=C=>C.some(P=>P[0].some(p=>p[0]>170))&&C.some(P=>P[0].some(p=>p[0]<-170));
const bboxOf=P=>{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of P[0]){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);}return [x0,y0,x1,y1];};
const meets=(a,b)=>a[0]<=b[2]&&b[0]<=a[2]&&a[1]<=b[3]&&b[1]<=a[3];
function gapOf(name,list){
 const C0=countryPolys.get(name);if(!C0)return null;
 const wrap=straddles(C0),C=C0.map(P=>shiftPoly(P,wrap));
 const U=[];for(const f of list){const g=f.geometry;for(const P of g.type==='Polygon'?[g.coordinates]:g.coordinates){const S=shiftPoly(P,wrap);U.push({P:S,b:bboxOf(S)});}}
 // one country piece at a time, against the units that reach it: keeps large coastlines (Chile) within the
 // clipper's limits, and a piece it cannot handle is skipped alone
 const d=[];let tiled=0,skipped=0;
 const diff=(P,b)=>{const near=U.filter(u=>meets(b,u.b)).map(u=>u.P);return near.length?pc.difference(P,...near):[P];};
 // a tile that fails is split into quarters, down to 1/8°
 const tile=(P,t,size)=>{
  try{d.push(...pc.intersection(P,[[[t[0],t[1]],[t[2],t[1]],[t[2],t[3]],[t[0],t[3]],[t[0],t[1]]]]).flatMap(T=>diff(T,t)));return;}catch(e){}
  if(size<=1/8){skipped+=size*size;return;}
  const h=size/2;for(const [x,y] of [[0,0],[h,0],[0,h],[h,h]])tile(P,[t[0]+x,t[1]+y,t[0]+x+h,t[1]+y+h],h);};
 for(const P of C){const b=bboxOf(P);
  try{d.push(...diff(P,b));continue;}catch(e){}
  // too large or awkward in one go (Chile's fjords): cut the piece into 1° tiles and do each alone
  tiled++;
  for(let x=Math.floor(b[0]);x<b[2];x++)for(let y=Math.floor(b[1]);y<b[3];y++)tile(P,[x,y,x+1,y+1],1);}
 if(tiled)console.warn('gap check: '+name+': '+tiled+' piece(s) done in tiles'+(skipped?', '+skipped+' square degrees skipped':''));
 let km2=0;
 const keep=d.filter(P=>{const o=ringStats(P[0]),a=P.slice(1).reduce((s,h)=>s-ringStats(h).a,o.a);
  if(a<MIN_KM2||2*a/o.p<MIN_WIDTH_KM)return false;km2+=a;return true;});
 if(!keep.length)return null;
 // polygon-clipping winds outer rings anticlockwise; d3 reads rings on the sphere the other way round
 return {km2,geometry:{type:'MultiPolygon',coordinates:keep.map(P=>P.map(r=>r.slice().reverse()))}};}
const gaps=[];
for(const [name,{a3,list}] of units){
 const feats=list;
 if(feats.length<2)continue; // a single unit adds nothing over the country itself
 const gap=gapOf(name,list),base=a3.replace(/[^A-Z0-9]/g,'');
 if(gap){list.push({type:'Feature',id:Math.max(...list.map(f=>f.id))+1,geometry:gap.geometry,properties:{n:'Rest of '+name,c:base+'+0',ty:'Not divided in the source data',r:'',g:''}});
  gaps.push(name+' '+Math.round(gap.km2)+' km² in '+gap.geometry.coordinates.length);}
 const fc={type:'FeatureCollection',features:list};
 const topo=ts.topology({u:fc},1e5);
 const file=a3.replace(/[^A-Z0-9]/g,'')+'.json',out=JSON.stringify(topo);
 fs.writeFileSync(R('data/admin1/'+file),out);total+=out.length;
 // groupings worth offering: a field with 2+ values that groups several units
 const groups={};for(const k of ['g','r']){const vals=new Set(fc.features.map(f=>f.properties[k]).filter(Boolean));if(vals.size>1&&vals.size<feats.length)groups[k]=vals.size;}
 index[name]={f:file,n:feats.length,gr:groups};}
fs.writeFileSync(R('data/admin1/index.json'),JSON.stringify(index));
console.log('countries with subdivisions:',Object.keys(index).length,'total MB',(total/1e6).toFixed(1));
console.log('unmatched admin names:',[...unmatched].join(', ')||'none');
console.log('"Rest of" units for areas no subdivision covers ('+gaps.length+'):',gaps.join('; ')||'none');
const big=Object.entries(index).map(([k,v])=>[k,fs.statSync(R('data/admin1/'+v.f)).size]).sort((a,b)=>b[1]-a[1]).slice(0,5);console.log('largest files:',big.map(([k,s])=>k+' '+(s/1e6).toFixed(2)+'MB').join(', '));
console.log('UK:',JSON.stringify(index['United Kingdom']),'USA:',JSON.stringify(index['United States of America']));
