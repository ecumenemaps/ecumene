// Assembles dist/index.html: one self-contained page (no network needed at runtime).
const fs=require('fs'),path=require('path');
const R=p=>path.join(__dirname,'..',p),rd=p=>fs.readFileSync(R(p),'utf8');
const need=['data/tris.b64','data/phys.b64','data/admin1/index.json'];
for(const f of need)if(!fs.existsSync(R(f))){console.error('Missing '+f+' - run: npm run fetch && npm run data');process.exit(1);}
// subdivision files are served next to the page and fetched on demand
fs.mkdirSync(R('dist/admin1'),{recursive:true});for(const f of fs.readdirSync(R('data/admin1')))fs.copyFileSync(R('data/admin1/'+f),R('dist/admin1/'+f));
const countries=JSON.stringify(JSON.parse(rd('node_modules/world-atlas/countries-10m.json')));
const out=rd('src/template.html')
 +'<script type="application/json" id="data">'+countries+'</script>\n'
 +'<script type="application/octet-stream" id="phys">'+rd('data/phys.b64')+'</script>\n'
 +'<script type="application/octet-stream" id="tris">'+rd('data/tris.b64')+'</script>\n'
 +'<script type="application/json" id="a1idx">'+rd('data/admin1/index.json')+'</script>\n'
 +'<script>'+rd('node_modules/d3/dist/d3.min.js')+'</script>\n'
 +'<script>'+rd('node_modules/topojson-client/dist/topojson-client.min.js')+'</script>\n'
 +'<script>'+rd('src/groups.js')+'\n'+rd('src/app.js')+'</script>\n</body>\n</html>\n';
fs.mkdirSync(R('dist'),{recursive:true});fs.writeFileSync(R('dist/index.html'),out);
console.log('dist/index.html',(out.length/1e6).toFixed(2),'MB');
