// Temporary remote-dev check only: no production bindings, credentials, or arbitrary URLs.
import {loadRoster,parseRoster} from '../../worker/public-rosters.mjs';
export default {async fetch(request) {
  const path=new URL(request.url).pathname;
  if(path==='/ready')return Response.json({ready:true});
  if(path!=='/check')return new Response('Not found',{status:404});
  try {
    const friends=await loadRoster(fetch,'15000469','friends');
    const response=await fetch('https://na.finalfantasyxiv.com/lodestone/freecompany/9230831123737734814/member/',{redirect:'manual',signal:AbortSignal.timeout(15000)});
    if(!response.ok)return Response.json({ok:false,stage:'fc',status:response.status},{status:502});
    const fc=await parseRoster(await response.text());
    const linked=await loadRoster(fetch,fc.characters[0].lodestone_id,'fc');
    return Response.json({ok:true,friends:friends.characters.length,fc:fc.characters.length,linked_fc:linked.characters.length});
  }catch(error){return Response.json({ok:false,reason:error.message},{status:502});}
}};
