export const normalizeEnglish = value => String(value).trim().toLowerCase().replace(/\s+/g, ' ');
export const normalizeKorean = value => String(value).trim().replace(/\s+/g, '').replace(/[.,·ㆍ]/g, '');

export function parseCsv(text) {
  const rows=[]; let row=[], field='', quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i],next=text[i+1];
    if(c==='"'&&quoted&&next==='"'){field+='"';i++;}
    else if(c==='"'){quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&next==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(field||row.length){row.push(field);rows.push(row);}
  return rows.slice(1).filter(row=>row[0]&&row.slice(1).some(Boolean)).map(row=>({english:row[0].trim(),korean:row.slice(1).join(',').trim()}));
}

export const koreanAnswerCandidates = value => String(value).split(/\s*(?:[,/;·ㆍ]|또는)\s*/).filter(Boolean).map(normalizeKorean);

export function dataSnapshot(decks=[], registry={}) {
  const normalizedDecks=[...decks].map(deck=>({
    id:deck.id,
    name:deck.name,
    createdAt:deck.createdAt,
    words:[...(deck.words||[])].map(word=>({id:word.id,english:word.english,korean:word.korean,attempts:word.attempts||0,correct:word.correct||0,registryNo:word.registryNo||null})).sort((a,b)=>String(a.id).localeCompare(String(b.id)))
  })).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const normalizedRegistry=Object.fromEntries(Object.entries(registry||{}).sort(([a],[b])=>a.localeCompare(b)));
  return JSON.stringify({decks:normalizedDecks,registry:normalizedRegistry});
}

export function syncPlan({ isFirstLogin, localDeckCount, remoteDeckCount, isDirty, remoteChanged, forcePush=false }) {
  if (isFirstLogin && remoteDeckCount && localDeckCount && !forcePush) return 'migration-choice';
  if (isFirstLogin && remoteDeckCount && !localDeckCount) return 'pull';
  if (isFirstLogin) return 'push';
  if (isDirty && remoteChanged && !forcePush) return 'conflict';
  return isDirty ? 'push' : 'pull';
}
