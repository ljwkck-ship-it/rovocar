import assert from 'node:assert/strict';
import { dataSnapshot, koreanAnswerCandidates, normalizeEnglish, parseCsv, syncPlan } from '../core.mjs';

assert.equal(normalizeEnglish('  Take   Care Of '), 'take care of');
assert.deepEqual(koreanAnswerCandidates('수반하다, 포함하다 · 관계하다 / 또는 연결하다; 묶다'), ['수반하다','포함하다','관계하다','연결하다','묶다']);

const csv=parseCsv('English,Korean\ninvolve,"수반하다, 포함하다"\n"right, correct",옳은');
assert.deepEqual(csv, [
  { english:'involve', korean:'수반하다, 포함하다' },
  { english:'right, correct', korean:'옳은' }
]);

const first={decks:[{id:'deck-b',name:'B',createdAt:'2026-07-18',words:[{id:'word-2',english:'seal',korean:'가두다',attempts:0,correct:0,registryNo:2},{id:'word-1',english:'apple',korean:'사과',attempts:1,correct:1,registryNo:1}]}],registry:{seal:2,apple:1}};
const reordered={decks:[{...first.decks[0],words:[...first.decks[0].words].reverse()}],registry:{apple:1,seal:2}};
assert.equal(dataSnapshot(first.decks,first.registry),dataSnapshot(reordered.decks,reordered.registry),'정렬 순서만 달라져도 동기화 충돌로 판단하면 안 됩니다.');
const changed={...first,decks:[{...first.decks[0],name:'수정됨'}]};
assert.notEqual(dataSnapshot(first.decks,first.registry),dataSnapshot(changed.decks,changed.registry),'실제 변경은 동기화 충돌로 감지해야 합니다.');

assert.equal(syncPlan({isFirstLogin:true,localDeckCount:1,remoteDeckCount:2,isDirty:false,remoteChanged:false}),'migration-choice');
assert.equal(syncPlan({isFirstLogin:true,localDeckCount:1,remoteDeckCount:2,isDirty:false,remoteChanged:false,forcePush:true}),'push');
assert.equal(syncPlan({isFirstLogin:false,localDeckCount:1,remoteDeckCount:1,isDirty:true,remoteChanged:true}),'conflict');
assert.equal(syncPlan({isFirstLogin:false,localDeckCount:1,remoteDeckCount:1,isDirty:true,remoteChanged:true,forcePush:true}),'push');

console.log('RoVoCar core tests passed: CSV, alternate meanings, and sync snapshots');
