// Browser tests. The globe needs WebGL2. In CI and on headless Linux (no display) we use SwiftShader,
// a software GPU, which is slow, hence the generous timeouts and a modest viewport. Elsewhere the
// browser uses the machine's real GPU. Set SOFTWARE_GL=1 to force SwiftShader anywhere.
// Every test opens its own page, so tests are independent: CI splits them across machines one by one (--shard),
// and here they run one at a time (workers:1) since each uses the GPU heavily.
const {defineConfig}=require('@playwright/test');
const software=!!(process.env.CI||process.env.SOFTWARE_GL||(process.platform==='linux'&&!process.env.DISPLAY));
module.exports=defineConfig({
 testDir:'tests/e2e',fullyParallel:true,timeout:240000,expect:{timeout:30000},workers:1,retries:process.env.CI?1:0,reporter:[['list']],
 use:{baseURL:'http://127.0.0.1:8790',viewport:{width:960,height:640},actionTimeout:120000,
  launchOptions:{args:software?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']:['--ignore-gpu-blocklist']}},
 webServer:{command:'node tests/server.js',url:'http://127.0.0.1:8790/app/index.html',reuseExistingServer:!process.env.CI,timeout:30000}
});
