// Wrangler remote dev runs this isolated probe on Cloudflare and is stopped afterwards.
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--config','tests/fixtures/roster-probe.jsonc','--remote','--ip','127.0.0.1','--port','8791','--log-level','error'],{stdio:'ignore',env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});
let spawnError=null;child.on('error',error=>{spawnError=error;});
try {
  const deadline=Date.now()+90000;let ready=false;
  while(Date.now()<deadline){if(spawnError)throw spawnError;if(child.exitCode!==null)throw Error(`Cloudflare preview exited (${child.exitCode}). Check deployment token permissions.`);try{const r=await fetch('http://127.0.0.1:8791/ready',{signal:AbortSignal.timeout(3000)});ready=r.ok&&(await r.json()).ready;if(ready)break;}catch{/* Preview is still starting. */}await delay(1000);}
  assert.ok(ready,'Cloudflare remote preview did not become ready');
  const response=await fetch('http://127.0.0.1:8791/check',{signal:AbortSignal.timeout(65000)}),result=await response.json();
  assert.ok(response.ok&&result.ok,`Cloudflare Lodestone check failed: ${JSON.stringify(result)}`);
  assert.ok(result.friends>0&&result.fc>0&&result.linked_fc>0);
  console.log(`Cloudflare-origin Lodestone verified: ${result.friends} friends, ${result.fc} FC entries, ${result.linked_fc} entries via character-linked FC lookup. No production data changed.`);
}finally{
  child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(3000)]);if(child.exitCode===null)child.kill('SIGKILL');
}
