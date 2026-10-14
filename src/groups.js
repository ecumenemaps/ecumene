// Country groups and name matching. Names must match the Natural Earth names used by the map.
// Works in the browser (global `Ecu`) and in Node (module.exports) for scripts/test_groups.js.
const Ecu=(()=>{
const split=s=>s.split('|').map(x=>x.trim()).filter(Boolean);
const CONTINENTS={
 'Africa':split(`Algeria|Angola|Benin|Botswana|Br. Indian Ocean Ter.|Burkina Faso|Burundi|Cabo Verde|Cameroon|Central African Rep.|Chad|Comoros|Congo|Côte d'Ivoire|Dem. Rep. Congo|Djibouti|Egypt|Eq. Guinea|Eritrea|eSwatini|Ethiopia|Fr. S. Antarctic Lands|Gabon|Gambia|Ghana|Guinea|Guinea-Bissau|Kenya|Lesotho|Liberia|Libya|Madagascar|Malawi|Mali|Mauritania|Mauritius|Mayotte|Morocco|Mozambique|Namibia|Niger|Nigeria|Réunion|Rwanda|Saint Helena|Senegal|Seychelles|Sierra Leone|Somalia|Somaliland|South Africa|S. Sudan|Sudan|São Tomé and Principe|Tanzania|Togo|Tunisia|Uganda|W. Sahara|Zambia|Zimbabwe`),
 'Asia':split(`Afghanistan|Akrotiri|Armenia|Azerbaijan|Bahrain|Bangladesh|Bhutan|Brunei|Cambodia|China|Cyprus|Cyprus U.N. Buffer Zone|Dhekelia|Georgia|Hong Kong|India|Indonesia|Iran|Iraq|Israel|Japan|Jordan|Kazakhstan|Kuwait|Kyrgyzstan|Laos|Lebanon|Macao|Malaysia|Maldives|Mongolia|Myanmar|N. Cyprus|Nepal|North Korea|Oman|Pakistan|Palestine|Philippines|Qatar|Saudi Arabia|Scarborough Reef|Siachen Glacier|Singapore|South Korea|Spratly Is.|Sri Lanka|Syria|Taiwan|Tajikistan|Thailand|Timor-Leste|Turkey|Turkmenistan|United Arab Emirates|Uzbekistan|Vietnam|Yemen`),
 'Europe':split(`Albania|Andorra|Austria|Belarus|Belgium|Bosnia and Herz.|Bulgaria|Croatia|Czechia|Denmark|Estonia|Faeroe Is.|Finland|France|Germany|Gibraltar|Greece|Guernsey|Hungary|Iceland|Ireland|Isle of Man|Italy|Jersey|Kosovo|Latvia|Liechtenstein|Lithuania|Luxembourg|Macedonia|Malta|Moldova|Monaco|Montenegro|Netherlands|Norway|Poland|Portugal|Romania|Russia|San Marino|Serbia|Slovakia|Slovenia|Spain|Sweden|Switzerland|Ukraine|United Kingdom|Vatican|Åland`),
 'North America':split(`Anguilla|Antigua and Barb.|Aruba|Bahamas|Bajo Nuevo Bank|Barbados|Belize|Bermuda|British Virgin Is.|Canada|Caribbean Netherlands|Cayman Is.|Clipperton I.|Costa Rica|Cuba|Curaçao|Dominica|Dominican Rep.|El Salvador|Greenland|Grenada|Guadeloupe|Guatemala|Haiti|Honduras|Jamaica|Martinique|Mexico|Montserrat|Nicaragua|Panama|Puerto Rico|Saint Lucia|Serranilla Bank|Sint Maarten|St-Barthélemy|St-Martin|St. Kitts and Nevis|St. Pierre and Miquelon|St. Vin. and Gren.|Trinidad and Tobago|Turks and Caicos Is.|U.S. Virgin Is.|United States of America`),
 'South America':split(`Argentina|Bolivia|Brazil|Chile|Colombia|Ecuador|Falkland Is.|French Guiana|Guyana|Paraguay|Peru|S. Geo. and the Is.|Suriname|Uruguay|Venezuela`),
 'Oceania':split(`American Samoa|Ashmore and Cartier Is.|Australia|Coral Sea Is.|Cook Is.|Fiji|Fr. Polynesia|Guam|Heard I. and McDonald Is.|Indian Ocean Ter.|Kiribati|Marshall Is.|Micronesia|N. Mariana Is.|Nauru|New Caledonia|New Zealand|Niue|Norfolk Island|Palau|Papua New Guinea|Pitcairn Is.|Samoa|Solomon Is.|Tonga|Tuvalu|U.S. Minor Outlying Is.|Vanuatu|Wallis and Futuna Is.`),
 'Antarctica':split(`Antarctica`)
};
const GROUPS={
 'European Union (27)':split(`Austria|Belgium|Bulgaria|Croatia|Cyprus|Czechia|Denmark|Estonia|Finland|France|Germany|Greece|Hungary|Ireland|Italy|Latvia|Lithuania|Luxembourg|Malta|Netherlands|Poland|Portugal|Romania|Slovakia|Slovenia|Spain|Sweden|French Guiana|Guadeloupe|Martinique|Mayotte|Réunion`),
 'Eurozone (21)':split(`Austria|Belgium|Bulgaria|Croatia|Cyprus|Estonia|Finland|France|Germany|Greece|Ireland|Italy|Latvia|Lithuania|Luxembourg|Malta|Netherlands|Portugal|Slovakia|Slovenia|Spain|French Guiana|Guadeloupe|Martinique|Mayotte|Réunion`),
 'NATO (32)':split(`Albania|Belgium|Bulgaria|Canada|Croatia|Czechia|Denmark|Estonia|Finland|France|Germany|Greece|Hungary|Iceland|Italy|Latvia|Lithuania|Luxembourg|Montenegro|Netherlands|Macedonia|Norway|Poland|Portugal|Romania|Slovakia|Slovenia|Spain|Sweden|Turkey|United Kingdom|United States of America`),
 'G7':split(`Canada|France|Germany|Italy|Japan|United Kingdom|United States of America`),
 'G20 (19 countries)':split(`Argentina|Australia|Brazil|Canada|China|France|Germany|India|Indonesia|Italy|Japan|Mexico|Russia|Saudi Arabia|South Africa|South Korea|Turkey|United Kingdom|United States of America`),
 'ASEAN (11)':split(`Brunei|Cambodia|Indonesia|Laos|Malaysia|Myanmar|Philippines|Singapore|Thailand|Timor-Leste|Vietnam`),
 'UN Security Council permanent members':split(`China|France|Russia|United Kingdom|United States of America`)
};
for(const k in CONTINENTS)GROUPS[k]=CONTINENTS[k];
const GROUP_NOTES={'Asia':'Russia is counted in Europe; Turkey, Kazakhstan, the Caucasus and Cyprus in Asia. Cyprus is in Western Asia in the UN classification, though it is an EU member; Northern Cyprus, the buffer zone and the UK bases go with it.','Europe':'Russia is counted in Europe. Cyprus is counted in Asia, as in the UN classification, though it is an EU member.','North America':'Includes Central America and the Caribbean. The UN classification has one Americas region; its sub-regions decide the split between North and South America.','South America':'The UN classification has one Americas region; its South America sub-region is used here.','Antarctica':'The islands of the Southern Ocean go with the continent the UN classification gives them: South Georgia with South America, Heard and McDonald Islands with Oceania, the French Southern and Antarctic Lands with Africa.','G20 (19 countries)':'The African Union and EU are members but are not single countries. The 2026 presidency\'s own site (g20.org) lists its State Participants differently (no South Africa, Poland added); this shows the 19 standing members.','European Union (27)':'The member states plus France\'s overseas regions, which are part of the EU; the Canaries, Azores and Madeira are drawn as part of Spain and Portugal.','Eurozone (21)':'The member states plus France\'s overseas regions, which use the euro.'};
// Where each group's membership was checked and when (scripts/check_groups.js reads these pages and compares). The
// lists are facts; the terms of each page are in the README sources table.
const GROUPS_CHECKED='14 Oct 2026';
const GROUP_SOURCES={
 'European Union (27)':'the European Union\'s EU countries page',
 'Eurozone (21)':'the European Union\'s EU countries page and the European Central Bank\'s euro page',
 'NATO (32)':'NATO\'s member countries page',
 'G7':'the Government of Canada\'s G7 page (the EU takes part but is not a member country)',
 'G20 (19 countries)':'the Government of Canada\'s G20 page',
 'ASEAN (11)':'the Government of Japan\'s Ministry of Foreign Affairs ASEAN page (asean.org cannot be read by a script)',
 'UN Security Council permanent members':'Article 23 of the UN Charter (China and Russia hold the seats it names for the Republic of China and the USSR)'
};
// Continents follow the UN Statistics Division's M49 classification of countries and areas. Places it does not list
// (Kosovo, Taiwan, Somaliland, Northern Cyprus, reefs and banks) keep the continent of the land around them.
for(const c of Object.keys(CONTINENTS))GROUP_SOURCES[c]='the UN Statistics Division\'s M49 classification';
/** The note shown under a group: what it includes, and where its membership was checked and when. */
function groupNote(name){
 const n=GROUP_NOTES[name]||'',s=GROUP_SOURCES[name];
 return (n+(s?(n?' ':'')+'Membership checked against '+s+' on '+GROUPS_CHECKED+'.':'')).trim();
}
// user-friendly aliases -> map names
const ALIAS_RAW={
 'usa':'United States of America','us':'United States of America','u s':'United States of America','u s a':'United States of America','united states':'United States of America','united states of america':'United States of America','america':'United States of America',
 'uk':'United Kingdom','u k':'United Kingdom','britain':'United Kingdom','great britain':'United Kingdom',
 'drc':'Dem. Rep. Congo','dr congo':'Dem. Rep. Congo','democratic republic of the congo':'Dem. Rep. Congo','democratic republic of congo':'Dem. Rep. Congo','congo kinshasa':'Dem. Rep. Congo',
 'republic of the congo':'Congo','congo brazzaville':'Congo','congo republic':'Congo',
 'ivory coast':"Côte d'Ivoire",'cote d ivoire':"Côte d'Ivoire",
 'czech republic':'Czechia','swaziland':'eSwatini','north macedonia':'Macedonia','east timor':'Timor-Leste','burma':'Myanmar','cape verde':'Cabo Verde',
 'bosnia':'Bosnia and Herz.','bosnia and herzegovina':'Bosnia and Herz.','dominican republic':'Dominican Rep.','central african republic':'Central African Rep.',
 'equatorial guinea':'Eq. Guinea','south sudan':'S. Sudan','western sahara':'W. Sahara','falkland islands':'Falkland Is.','solomon islands':'Solomon Is.','marshall islands':'Marshall Is.',
 'antigua and barbuda':'Antigua and Barb.','saint kitts and nevis':'St. Kitts and Nevis','st kitts and nevis':'St. Kitts and Nevis','saint vincent and the grenadines':'St. Vin. and Gren.','st vincent and the grenadines':'St. Vin. and Gren.',
 'sao tome and principe':'São Tomé and Principe','uae':'United Arab Emirates','emirates':'United Arab Emirates','russian federation':'Russia','republic of korea':'South Korea','dprk':'North Korea',
 'vatican city':'Vatican','holy see':'Vatican','state of palestine':'Palestine','turkiye':'Turkey','faroe islands':'Faeroe Is.','faroes':'Faeroe Is.','federated states of micronesia':'Micronesia',
 'holland':'Netherlands','hong kong sar':'Hong Kong','macau':'Macao','brunei darussalam':'Brunei','viet nam':'Vietnam','islamic republic of iran':'Iran','saint lucia':'Saint Lucia','st lucia':'Saint Lucia',
 'british virgin islands':'British Virgin Is.','cayman islands':'Cayman Is.','turks and caicos':'Turks and Caicos Is.','turks and caicos islands':'Turks and Caicos Is.','us virgin islands':'U.S. Virgin Is.','united states virgin islands':'U.S. Virgin Is.',
 'northern mariana islands':'N. Mariana Is.','cook islands':'Cook Is.','wallis and futuna':'Wallis and Futuna Is.','french polynesia':'Fr. Polynesia','saint pierre and miquelon':'St. Pierre and Miquelon',
 'saint barthelemy':'St-Barthélemy','saint martin':'St-Martin','aland islands':'Åland','aland':'Åland','pitcairn islands':'Pitcairn Is.','st helena':'Saint Helena','northern cyprus':'N. Cyprus','swaziland eswatini':'eSwatini',
 'french guyana':'French Guiana','guyane':'French Guiana','reunion island':'Réunion','bonaire':'Caribbean Netherlands','bonaire sint eustatius and saba':'Caribbean Netherlands','bes islands':'Caribbean Netherlands',
 'british indian ocean territory':'Br. Indian Ocean Ter.','south georgia and the south sandwich islands':'S. Geo. and the Is.','french southern and antarctic lands':'Fr. S. Antarctic Lands'
};
const norm=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[.'’]/g,' ').replace(/-/g,' ').replace(/^\s*the\s+/,'').replace(/\s+/g,' ').trim();
// Build a lookup from a list of valid map names. Returns resolve(text) -> name | null
function matcher(valid){
 const m=new Map();
 valid.forEach(n=>m.set(norm(n),n));
 for(const k in ALIAS_RAW){const t=ALIAS_RAW[k];if(valid.includes(t))m.set(norm(k),t);}
 return text=>m.get(norm(text))||null;
}
// Split free text into entries and resolve each. Returns {found:[names], unknown:[strings]}
function parseList(text,resolve){
 const found=[],unknown=[],seen=new Set();
 text.split(/[\n;,]+/).map(s=>s.trim()).filter(Boolean).forEach(s=>{const n=resolve(s);if(n){if(!seen.has(n)){seen.add(n);found.push(n);}}else unknown.push(s);});
 return {found,unknown};
}
// "Country, value" lines. Returns {rows:[{name,value}], unknown:[strings], bad:[lines]}
function parseData(text,resolve){
 const rows=[],unknown=[],bad=[],seen=new Map();
 text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).forEach(line=>{
  const m=line.match(/^(.*?)[\t;:,=]\s*([-+]?[\d][\d\s.,]*%?)\s*$/);
  if(!m){bad.push(line);return;}
  let v=m[2].replace(/[%\s]/g,'');
  if(/,/.test(v)&&/\./.test(v))v=v.replace(/,/g,'');else if(/^[-+]?\d{1,3}(,\d{3})+$/.test(v))v=v.replace(/,/g,'');else v=v.replace(',','.');
  const x=parseFloat(v),name=resolve(m[1].replace(/^["']|["']$/g,''));
  if(!Number.isFinite(x)){bad.push(line);return;}
  if(!name){unknown.push(m[1].trim());return;}
  if(seen.has(name))rows[seen.get(name)].value=x;else{seen.set(name,rows.length);rows.push({name,value:x});}
 });
 return {rows,unknown,bad};
}
// Class breaks. method 'equal' or 'quantile'. Returns n+1 ascending bounds (deduped, so fewer classes are possible).
function breaks(values,n,method){
 const v=values.slice().sort((a,b)=>a-b),lo=v[0],hi=v[v.length-1];
 let b=[];
 if(method==='quantile'){for(let i=0;i<=n;i++){const p=i/n*(v.length-1),f=Math.floor(p),c=Math.ceil(p);b.push(v[f]+(v[c]-v[f])*(p-f));}}
 else for(let i=0;i<=n;i++)b.push(lo+(hi-lo)*i/n);
 return b.filter((x,i)=>i===0||x>b[i-1]+1e-12);
}
function classOf(x,b){for(let i=1;i<b.length;i++)if(x<=b[i])return i-1;return b.length-2;}
function fmt(x){const a=Math.abs(x);if(a===0)return '0';if(a>=1e9)return +(x/1e9).toPrecision(3)+'B';if(a>=1e6)return +(x/1e6).toPrecision(3)+'M';if(a>=1e4)return Math.round(x).toLocaleString('en-US');
 return String(+x.toPrecision(a<1?2:3));}
return {CONTINENTS,GROUPS,GROUP_NOTES,GROUP_SOURCES,GROUPS_CHECKED,groupNote,ALIAS_RAW,norm,matcher,parseList,parseData,breaks,classOf,fmt};
})();
if(typeof module!=='undefined')module.exports=Ecu;
