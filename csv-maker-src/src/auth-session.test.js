import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./main.js',import.meta.url),'utf8');
function harness() {
  let renderCount=0;
  const context=vm.createContext({supabaseUrl:'https://example.supabase.co',sessionRevision:0,session:{user:{id:'A'}},state:{file:{name:'photo'},rows:[{english:'edited'}],warnings:[]},revokePreview(){},renderStart(){renderCount++;}});
  const start=source.indexOf('function onAuthSessionChanged(');
  if(start<0) {
    const old=source.match(/supabase\.auth\.onAuthStateChange\(\(_event, nextSession\) => \{([^}]+)\}\)/);
    vm.runInContext(`function onAuthSessionChanged(_event,nextSession){${old[1]}}`,context);
  } else vm.runInContext(source.slice(start,source.indexOf("window.addEventListener('beforeunload'",start)),context);
  return {context,run(event,next){context.next=next;context.event=event;vm.runInContext('onAuthSessionChanged(event,next)',context);},renders:()=>renderCount};
}
test('same-user auth refresh preserves the OCR file and edited review',()=>{
 const h=harness();h.run('TOKEN_REFRESHED',{user:{id:'A'}});
 assert.equal(h.renders(),0);assert.equal(h.context.state.rows[0].english,'edited');
});
test('account changes clear the previous account image and review',()=>{
 const h=harness();h.run('SIGNED_OUT',null);
 assert.equal(h.renders(),1);assert.equal(h.context.state.file,null);assert.equal(h.context.state.rows.length,0);
});

test('account switch while reading a photo cancels upload before fetch',async()=>{
 let finishRead,beginRead,posts=0;
 const readingStarted=new Promise(resolve=>{beginRead=resolve;});
 const reading=new Promise(resolve=>{finishRead=resolve;});
 const context=vm.createContext({supabaseUrl:'https://example.supabase.co',sessionRevision:0,session:{user:{id:'A'}},state:{file:{type:'image/png'}},supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'A'},access_token:'fixture'}}})}},fileAsBase64:()=>{beginRead();return reading;},fetch:async()=>{posts++;return {ok:true,json:async()=>({items:[]})};}});
 const start=source.indexOf('async function extractFromServer(');
 vm.runInContext(source.slice(start,source.indexOf('async function renderExtracting(',start)),context);
 const pending=vm.runInContext('extractFromServer()',context);
 await readingStarted;
 context.sessionRevision++;context.session={user:{id:'B'}};context.state.file={type:'image/jpeg'};
 finishRead('fixture-image');
 await assert.rejects(pending);
 assert.equal(posts,0);
});
