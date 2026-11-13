import assert from 'node:assert/strict';
import test from 'node:test';
import { testDatabase } from './d1.mjs';
import { createService } from '../service/src/worker.mjs';
import { links } from '../service/src/ohm.mjs';
import skills from '../service/src/capabilities/skills.mjs';
import tools from '../service/src/capabilities/tools.mjs';
import mirror from '../service/src/capabilities/mirror.mjs';

const A = 'did:web:a.test', B = 'did:web:b.test';
let serial = 0;
async function setup(t) {
  const DB = await testDatabase(), linked = links(DB), user = `user-${serial++}`;
  t.after(() => DB.sqlite.close());
  const env = { DB, MEMBERS: '*', SERVICE_DID: 'did:web:vault.test', OHM_APP_ORIGIN: 'https://app.test', AUTH: { fetch: async () => Response.json({ user: { id: user } }) } };
  await linked.connect(user, A);
  const service = createService();
  const ask = (name, body, expected = A) => service(new Request(`https://app.test/xrpc/${name}`, { method: body ? 'POST' : 'GET', headers: { Cookie: `session=${user}`, Origin: env.OHM_APP_ORIGIN, ...(expected ? { 'X-Ohm-Did': expected } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? {body: JSON.stringify(body)} : {}) }), env);
  return { DB, linked, user, env, ask };
}
test('cookie data/keyboard access honors MEMBERS but account recovery stays available', async t => {
  const { env, ask } = await setup(t);
  env.MEMBERS = B;
  for (const [name, body] of [['com.ohmmmm.vault.getTree'], ['com.ohmmmm.cortex.approveSkill', {name:'sample', version:'old'}], ['com.ohmmmm.cortex.putTool', {tool:{name:'sample',description:'Sample',on:false}}]]) {
    const response = await ask(name, body);
    assert.equal(response.status,403); assert.equal((await response.json()).error,'NotAMember');
  }
  assert.equal((await ask('com.ohmmmm.account.get')).status,200);
  assert.equal((await ask('com.ohmmmm.account.disconnect',{})).status,200);
  assert.equal((await ask('com.ohmmmm.account.get',null,null)).status,200);
  assert.equal((await ask('com.ohmmmm.vault.getTree',null,null)).status,409);
});

test('keyboard mutations keep the DID checked before a concurrent reconnect', async t => {
  for (const operation of ['approveSkill','deleteSkill','putTool','deleteTool']) {
    const { DB, linked, user, env, ask } = await setup(t);
    const versions=[];
    for (const did of [A,B]) {
      const context={env:{DB},did,user:{id:user},request:new Request('https://app.test')};
      versions.push(operation.endsWith('Skill')
        ? await skills.requests['com.ohmmmm.cortex.putSkill'].run({...context,request:new Request('https://app.test',{headers:{Authorization:'Bearer synthetic'}}),body:async()=>({skill:{text:'---\nname: sample\ndescription: Sample\n---\nInstructions',files:[]}})})
        : await tools.requests['com.ohmmmm.cortex.putTool'].run({...context,body:async()=>({tool:{name:'sample',description:'Sample',on:false}})}));
    }
    assert.equal(versions[0].version,versions[1].version);
    let armed=true;
    env.DB = { prepare(sql) {
      const prepared = DB.prepare(sql);
      if (!sql.startsWith('SELECT did, mirrored_at FROM links')) return prepared;
      return { bind(...values) {
        const bound = prepared.bind(...values);
        return { ...bound, async first() {
          const row = await bound.first();
          if (armed) { armed = false; await linked.disconnect(user); await linked.connect(user, B); }
          return row;
        } };
      } };
    } };
    const body=operation==='approveSkill'?{name:'sample',version:versions[0].version}:operation==='putTool'?{tool:{name:'sample',description:'Changed',on:true},replaces:versions[0].version}:{name:'sample',replaces:versions[0].version};
    const response=await ask(`com.ohmmmm.cortex.${operation}`,body);
    assert.equal(response.status,200,await response.clone().text());
    const held=await DB.prepare(`SELECT * FROM ${operation.endsWith('Skill')?'cortex_skills':'cortex_tools'} WHERE did=?1`).bind(B).first();
    assert.equal(held.version,versions[1].version);
    if(operation==='approveSkill')assert.equal(held.approved_version,null);
    if(operation==='putTool')assert.equal(held.enabled,0);
    const original = await DB.prepare(`SELECT * FROM ${operation.endsWith('Skill') ? 'cortex_skills' : 'cortex_tools'} WHERE did=?1`).bind(A).first();
    if (operation === 'approveSkill') assert.equal(original.approved_version, versions[0].version);
    else if (operation === 'putTool') assert.equal(original.enabled, 1);
    else assert.equal(original.version, null);
  }
});

test('old mirror completion cannot mark a reconnected DID mirrored', async t => {
  const {DB,linked,user}=await setup(t); let changed=false;
  await assert.rejects(mirror.requests['com.ohmmmm.vault.importPublished'].run({env:{DB},did:A,user:{id:user},linked,body:async()=>({apply:true,site:'https://site.test'}),identify:{pdsFor:async()=> 'https://pds.test'},posts:{},get:async url=>{if(!changed){changed=true;await linked.disconnect(user);await linked.connect(user,B);}return Response.json(new URL(url).pathname.endsWith('describeRepo')?{collections:[]}:{records:[]});}}),error=>error.code==='AccountChanged');
  assert.deepEqual(await linked.of(user),{did:B,mirrored:false});
});
