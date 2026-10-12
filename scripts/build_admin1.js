// Splits Natural Earth 10m admin-1 (states/provinces) into one small TopoJSON file per country,
// written to data/admin1/<A3>.json, plus data/admin1/index.json mapping map country names to files.
// Run: node scripts/build_admin1.js   (needs data/src/ne_10m_admin_1_states_provinces.geojson; see scripts/fetch_data.sh)
const fs=require('fs'),path=require('path'),ts=require('topojson-server'),tj=require('topojson-client');
const R=p=>path.join(__dirname,'..',p);
const src=JSON.parse(fs.readFileSync(R('data/src/ne_10m_admin_1_states_provinces.geojson')));
const world=require('world-atlas/countries-10m.json');
const ALIAS={'Baikonur':'Kazakhstan','USNB Guantanamo Bay':'Cuba'};
const mapNames=new Set(tj.feature(world,world.objects.countries).features.filter(f=>f.properties&&f.properties.name).map(f=>ALIAS[f.properties.name]||f.properties.name));
const Ecu=require('../src/groups.js'),resolve=Ecu.matcher([...mapNames]);
// Natural Earth admin-1 'admin' names that differ from the map's country names
const FIX={'United Republic of Tanzania':'Tanzania','Republic of Serbia':'Serbia','The Bahamas':'Bahamas','Federated States of Micronesia':'Micronesia','Republic of the Congo':'Congo','Democratic Republic of the Congo':'Dem. Rep. Congo','Guinea Bissau':'Guinea-Bissau','East Timor':'Timor-Leste','Ivory Coast':"Côte d'Ivoire",'Northern Cyprus':'N. Cyprus','North Macedonia':'Macedonia','Hong Kong S.A.R.':'Hong Kong','Macao S.A.R':'Macao','eSwatini':'eSwatini','Swaziland':'eSwatini','Cape Verde':'Cabo Verde','Faroe Islands':'Faeroe Is.','Aland':'Åland','Curaçao':'Curaçao','Saint Barthelemy':'St-Barthélemy','Saint Martin':'St-Martin','Sao Tome and Principe':'São Tomé and Principe','Czech Republic':'Czechia','Western Sahara':'W. Sahara','Somaliland':'Somaliland','Falkland Islands':'Falkland Is.','French Southern and Antarctic Lands':'Fr. S. Antarctic Lands','South Georgia and the Islands':'S. Geo. and the Is.','Heard Island and McDonald Islands':'Heard I. and McDonald Is.','United States Virgin Islands':'U.S. Virgin Is.','British Virgin Islands':'British Virgin Is.','Northern Mariana Islands':'N. Mariana Is.','Turks and Caicos Islands':'Turks and Caicos Is.','Cayman Islands':'Cayman Is.','Cook Islands':'Cook Is.','Marshall Islands':'Marshall Is.','Solomon Islands':'Solomon Is.','Pitcairn Islands':'Pitcairn Is.','Wallis and Futuna':'Wallis and Futuna Is.','French Polynesia':'Fr. Polynesia','Saint Pierre and Miquelon':'St. Pierre and Miquelon','Saint Kitts and Nevis':'St. Kitts and Nevis','Saint Vincent and the Grenadines':'St. Vin. and Gren.','Antigua and Barbuda':'Antigua and Barb.','Bosnia and Herzegovina':'Bosnia and Herz.','Central African Republic':'Central African Rep.','Dominican Republic':'Dominican Rep.','Equatorial Guinea':'Eq. Guinea','South Sudan':'S. Sudan','Vatican':'Vatican','Saint Helena':'Saint Helena','British Indian Ocean Territory':'Br. Indian Ocean Ter.','Indian Ocean Territories':'Indian Ocean Ter.','United States Minor Outlying Islands':'U.S. Minor Outlying Is.','Ashmore and Cartier Islands':'Ashmore and Cartier Is.','Gaza Strip':'Palestine','West Bank':'Palestine','Macau S.A.R':'Macao','Macao S.A.R':'Macao'};
const byCountry=new Map(),unmatched=new Set();
for(const f of src.features){const p=f.properties;if(!f.geometry)continue;
 const name=FIX[p.admin]&&mapNames.has(FIX[p.admin])?FIX[p.admin]:mapNames.has(p.admin)?p.admin:resolve(p.admin);
 if(!name){unmatched.add(p.admin);continue;}
 if(!byCountry.has(name))byCountry.set(name,{a3:p.adm0_a3,feats:[]});
 byCountry.get(name).feats.push(f);}
fs.mkdirSync(R('data/admin1'),{recursive:true});
const index={};let total=0;
const clean=v=>typeof v==='string'&&v.trim()&&v!=='null'?v.trim():'';
for(const [name,{a3,feats}] of byCountry){
 if(feats.length<2)continue; // a single unit adds nothing over the country itself
 const fc={type:'FeatureCollection',features:feats.map((f,i)=>{const p=f.properties;
  return {type:'Feature',id:i,geometry:f.geometry,properties:{n:clean(p.name_en)||clean(p.name)||('Unit '+(i+1)),ty:clean(p.type_en),r:clean(p.region),g:clean(p.geonunit)!==clean(p.admin)?clean(p.geonunit):''}};})};
 const topo=ts.topology({u:fc},1e5);
 const file=a3.replace(/[^A-Z0-9]/g,'')+'.json',out=JSON.stringify(topo);
 fs.writeFileSync(R('data/admin1/'+file),out);total+=out.length;
 // groupings worth offering: a field with 2+ values that groups several units
 const groups={};for(const k of ['g','r']){const vals=new Set(fc.features.map(f=>f.properties[k]).filter(Boolean));if(vals.size>1&&vals.size<feats.length)groups[k]=vals.size;}
 index[name]={f:file,n:feats.length,gr:groups};}
fs.writeFileSync(R('data/admin1/index.json'),JSON.stringify(index));
console.log('countries with subdivisions:',Object.keys(index).length,'total MB',(total/1e6).toFixed(1));
console.log('unmatched admin names:',[...unmatched].join(', ')||'none');
const big=Object.entries(index).map(([k,v])=>[k,fs.statSync(R('data/admin1/'+v.f)).size]).sort((a,b)=>b[1]-a[1]).slice(0,5);console.log('largest files:',big.map(([k,s])=>k+' '+(s/1e6).toFixed(2)+'MB').join(', '));
console.log('UK:',JSON.stringify(index['United Kingdom']),'USA:',JSON.stringify(index['United States of America']));
