// Public catalog contract check; no character IDs, authentication or private data.
import { setTimeout as delay } from 'node:timers/promises';
import { normalizeCatalog, KINDS } from '../worker/field-notes.mjs';
const once = process.argv.includes('--once');
const studium = process.argv.includes('--studium');
for (const kind of KINDS) {
  let passed = false;
  for (let attempt = 0; attempt < (studium && !once ? 6 : 1); attempt++) {
    const url = studium ? `https://studium.yycholla.com/api/field-notes/catalog?kind=${kind}` : `https://ffxivcollect.com/api/${kind}?language=en`;
    const response = await fetch(url, {redirect:'manual',headers:{Accept:'application/json'},signal:AbortSignal.timeout(30000)});
    const data = await response.json().catch(()=>null);
    console.log(JSON.stringify({kind,attempt,status:response.status,content_type:response.headers.get('content-type'),reference:data?.reference}));
    if(response.ok) {
      const items = studium ? data?.items : normalizeCatalog(data);
      if(!Array.isArray(items) || !items.length) throw new Error(`Invalid public catalog: ${kind}`);
      console.log(`${kind}: validated ${items.length} collectibles`); passed=true; break;
    }
    if(studium && !once && attempt < 5) await delay(15000);
  }
  if(!passed)throw new Error(`Public ${studium?'Studium':'provider'} catalog unavailable: ${kind}`);
}
