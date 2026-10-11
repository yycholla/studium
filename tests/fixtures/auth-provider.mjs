let mode;
let paths = [];
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname === 'control.test') {
      if (url.pathname === '/reset') { mode = await request.text(); paths = []; }
      return Response.json(paths);
    }
    paths.push(`${url.hostname}${url.pathname}`);
    if (url.hostname === 'ffxivcollect.com') {
      if (mode === 'collect-redirect') return Response.redirect('https://untrusted.test/collect', 307);
      return Response.json({count:1,results:[{id:1,name:'Company Chocobo',icon:'https://ffxivcollect.com/images/mounts/1.png',sources:[{type:'Quest',text:'My Little Chocobo'}]}]});
    }
    if (url.hostname !== 'xivauth.net') throw new Error('Credentials followed a provider redirect');
    const redirectPath = { token: '/oauth/token', user: '/api/v1/user', characters: '/api/v1/characters', revoke: '/oauth/revoke' }[mode];
    if (url.pathname === redirectPath) return Response.redirect('https://untrusted.test/collect', 307);
    if (url.pathname === '/oauth/token' || url.pathname === '/oauth/revoke') {
      const form = await request.formData();
      if (request.method !== 'POST' || form.get('client_secret') !== 'fixture-secret') throw new Error('Invalid token request');
      if (url.pathname === '/oauth/revoke') return Response.json({});
      if (form.get('redirect_uri') !== 'https://studium.yycholla.com/auth/callback' || !form.get('code_verifier')) throw new Error('Invalid callback or PKCE');
      return Response.json({ access_token: 'fixture-token', token_type: 'Bearer' });
    }
    if (request.headers.get('Authorization') !== 'Bearer fixture-token') throw new Error('Missing bearer token');
    if (url.pathname === '/api/v1/user') return Response.json({ id: 'fixture-user', display_name: 'Adventurer' });
    if (url.pathname === '/api/v1/characters') return Response.json([]);
    throw new Error('Unexpected provider path');
  },
};
