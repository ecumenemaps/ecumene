// Browser tests. The globe needs WebGL2; in CI and containers we use SwiftShader (software GPU),
// which is slow at high zoom, hence the generous timeouts and a modest viewport.
const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
 testDir:'tests/e2e',timeout:240000,expect:{timeout:30000},workers:1,retries:process.env.CI?1:0,reporter:[['list']],
 use:{baseURL:'http://127.0.0.1:8790',viewport:{width:960,height:640},actionTimeout:120000,
  launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']}},
 webServer:{command:'node tests/server.js',url:'http://127.0.0.1:8790/index.html',reuseExistingServer:!process.env.CI,timeout:30000}
});
