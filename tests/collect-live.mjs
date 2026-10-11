// Public catalog contract check; no character IDs, authentication or private data.
import { normalizeCatalog, KINDS } from '../worker/field-notes.mjs';
for (const kind of KINDS) {
  const response = await fetch(`https://ffxivcollect.com/api/${kind}?language=en`, { redirect:'manual',headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000) });
  console.log(JSON.stringify({kind,status:response.status,content_type:response.headers.get('content-type')}));
  if (!response.ok) throw new Error(`Public provider returned ${response.status} for ${kind}`);
  const data = await response.json();
  console.log(JSON.stringify({kind,count:data.count,results:data.results?.length,keys:Object.keys(data),invalid_ids:data.results?.filter(i=>!Number.isSafeInteger(i.id)||i.id<=0).map(i=>i.id)}));
  const items = normalizeCatalog(data);
  if (!items.length) throw new Error(`Empty public catalog: ${kind}`);
  console.log(`${kind}: validated ${items.length} collectibles`);
}
