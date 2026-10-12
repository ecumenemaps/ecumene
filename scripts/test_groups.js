// Sanity tests for src/groups.js against the real map names. Run: node scripts/test_groups.js
const tj=require('topojson-client'),t=require('world-atlas/countries-10m.json'),Ecu=require('../src/groups.js');
const A={'Baikonur':'Kazakhstan','USNB Guantanamo Bay':'Cuba'};
const names=[...new Set(tj.feature(t,t.objects.countries).features.filter(f=>f.properties&&f.properties.name).map(f=>A[f.properties.name]||f.properties.name))];
let fail=0;const bad=m=>{fail++;console.log('FAIL',m);};
for(const g in Ecu.GROUPS)for(const n of Ecu.GROUPS[g])if(!names.includes(n))bad(g+': unknown name '+n);
const seen=new Map();
for(const c in Ecu.CONTINENTS)for(const n of Ecu.CONTINENTS[c]){if(seen.has(n))bad(n+' in '+seen.get(n)+' and '+c);seen.set(n,c);}
names.forEach(n=>{if(!seen.has(n))bad('no continent: '+n);});
const exp={'European Union (27)':27,'Eurozone (21)':21,'NATO (32)':32,'G7':7,'G20 (19 countries)':19,'ASEAN (11)':11,'UN Security Council permanent members':5};
for(const k in exp)if(Ecu.GROUPS[k].length!==exp[k])bad(k+' has '+Ecu.GROUPS[k].length);
const r=Ecu.matcher(names);
for(const k in Ecu.ALIAS_RAW)if(!names.includes(Ecu.ALIAS_RAW[k]))bad('alias target missing: '+k);
const cases={'USA':'United States of America','the Gambia':'Gambia',"Cote d'Ivoire":"Côte d'Ivoire",'Ivory Coast':"Côte d'Ivoire",'czech republic':'Czechia','Niger':'Niger','Nigeria':'Nigeria','Bosnia & Herzegovina':'Bosnia and Herz.','Saint Kitts and Nevis':'St. Kitts and Nevis','Sao Tome and Principe':'São Tomé and Principe','Congo':'Congo','DR Congo':'Dem. Rep. Congo','North Macedonia':'Macedonia','Turkiye':'Turkey','Vatican City':'Vatican','Curacao':'Curaçao','Timor Leste':'Timor-Leste','Guinea-Bissau':'Guinea-Bissau','Åland':'Åland','Aland':'Åland'};
for(const k in cases)if(r(k)!==cases[k])bad(k+' -> '+r(k)+' (want '+cases[k]+')');
const d=Ecu.parseData('France, 68\nGermany;83.5\n"Ivory Coast"\t1,234\nAtlantis, 4\nSpain 5\nItaly: 12%\nFrance, 70',r);
console.log(JSON.stringify(d));
if(d.rows.length!==4||d.rows[0].value!==70||d.unknown[0]!=='Atlantis'||d.bad.length!==1)bad('parseData');
console.log('breaks eq',Ecu.breaks([1,2,3,10],3,'equal'),'q',Ecu.breaks([1,2,3,10,11,12],3,'quantile'),Ecu.fmt(1234567),Ecu.fmt(0.04567),Ecu.fmt(12345));
console.log(names.length+' names;',fail?fail+' FAILURES':'all checks passed');process.exit(fail?1:0);
