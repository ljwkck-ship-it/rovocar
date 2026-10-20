import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dataSnapshot, syncPlan } from '../core.mjs';

test('cloud sync discards results and metadata when authentication changes mid-request', async () => {
  let authCallback, resolveDecks;
  const firstQuery = new Promise(resolve => { resolveDecks = resolve; });
  const writes = [], events = [];
  const client = {
    auth: { getSession: async () => ({data:{session:{user:{id:'A'}}}}), onAuthStateChange(fn) { authCallback=fn; } },
    from(name) { return { select() { return this; }, order() { return name==='decks' ? firstQuery : Promise.resolve({data:[]}); }, then(resolve) { resolve({data:[]}); } }; },
  };
  const context = vm.createContext({ dataSnapshot, syncPlan, console, setTimeout,
    window: { ROVOCAR_SUPABASE:{url:'https://example.supabase.co',publishableKey:'test'}, supabase:{createClient:()=>client}, dispatchEvent(e){events.push(e.detail);}, addEventListener(){} },
    CustomEvent: class { constructor(type,{detail}){this.detail=detail;} }, navigator:{onLine:true},
    sessionStorage:{getItem:()=> '1'}, localStorage:{getItem:()=> '1',setItem(key,value){writes.push({key,value});},removeItem(key){writes.push({key});}},
  });
  vm.runInContext(readFileSync(new URL('../cloud.js',import.meta.url),'utf8').replace(/^import .*;\n/,''),context);
  const cloud = context.window.RoVoCloud;
  await cloud.init();
  const pending = cloud.sync([],{});
  authCallback('SIGNED_OUT',null);
  resolveDecks({data:[],error:null});
  assert.equal(await pending,null);
  assert.deepEqual(writes,[]);
  assert.equal(events.some(e=>e.type==='synced'),false);
});
