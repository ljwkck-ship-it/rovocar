(function () {
  const DIRTY_KEY = 'rovocar:cloud-dirty:v1';
  const config = window.ROVOCAR_SUPABASE || {};
  const configured = /^https:\/\/.+\.supabase\.co$/.test(config.url) && Boolean(config.publishableKey);
  const client = configured && window.supabase ? window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;
  let user = null;
  let syncing = false;
  const dirtyKey = () => user ? `${DIRTY_KEY}:${user.id}` : DIRTY_KEY;

  function emit(detail) { window.dispatchEvent(new CustomEvent('rovocar-cloud', { detail })); }
  function publicUser(value) {
    if (!value) return null;
    return { id: value.id, email: value.email || '', name: value.user_metadata?.name || value.user_metadata?.full_name || 'RoVoCar 사용자' };
  }
  async function signIn() {
    if (!client) throw new Error('Supabase 연결 설정이 필요합니다.');
    const { error } = await client.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: `${location.origin}${location.pathname}` }
    });
    if (error) throw error;
  }
  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }
  async function pull() {
    if (!client || !user) return null;
    const { data: decks, error: deckError } = await client.from('decks').select('id,name,created_at,order_index').order('order_index');
    if (deckError) throw deckError;
    const { data: words, error: wordError } = await client.from('words').select('id,deck_id,english,korean,attempts,correct,registry_no,order_index').order('order_index');
    if (wordError) throw wordError;
    const { data: registryRows, error: registryError } = await client.from('vocabulary_registry').select('english_normalized,registry_no');
    if (registryError) throw registryError;
    const grouped = new Map();
    for (const word of words || []) {
      if (!grouped.has(word.deck_id)) grouped.set(word.deck_id, []);
      grouped.get(word.deck_id).push({ id: word.id, english: word.english, korean: word.korean, attempts: word.attempts, correct: word.correct, registryNo: word.registry_no });
    }
    return { decks:(decks || []).map(deck => ({ id: deck.id, name: deck.name, createdAt: deck.created_at, words: grouped.get(deck.id) || [] })), registry:Object.fromEntries((registryRows||[]).map(row=>[row.english_normalized,row.registry_no])) };
  }
  async function push(decks, registry) {
    if (!client || !user || !navigator.onLine) return false;
    const { error } = await client.rpc('replace_user_data', { payload: { decks, registry } });
    if (error) throw error;
    localStorage.removeItem(dirtyKey());
    return true;
  }
  async function sync(decks, registry = {}, options = {}) {
    if (!client || !user || syncing) return null;
    if (!navigator.onLine) { localStorage.setItem(dirtyKey(), '1'); emit({ type: 'offline', user: publicUser(user) }); return null; }
    syncing = true; emit({ type: 'syncing', user: publicUser(user) });
    try {
      const migrationKey = `rovocar:cloud-migrated:${user.id}`;
      const isFirstLogin = !localStorage.getItem(migrationKey);
      const isDirty = localStorage.getItem(dirtyKey()) === '1' || options.forcePush;
      const remote = await pull();
      let result = null;
      if (isFirstLogin) {
        if (remote.decks.length) result = remote;
        else await push(decks,registry);
        localStorage.setItem(migrationKey, '1');
      } else if (isDirty) await push(decks,registry);
      else result = remote;
      emit({ type: 'synced', user: publicUser(user) });
      return result;
    } catch (error) {
      localStorage.setItem(dirtyKey(), '1'); emit({ type: 'error', error: error.message, user: publicUser(user) }); throw error;
    } finally { syncing = false; }
  }
  function markDirty() { localStorage.setItem(dirtyKey(), '1'); }
  async function recordVisit() {
    if (!client || !user || sessionStorage.getItem(`rovocar:visit:${user.id}`)) return;
    const { error } = await client.rpc('record_visit', { display_name_input: publicUser(user).name });
    if (!error) sessionStorage.setItem(`rovocar:visit:${user.id}`, '1');
  }
  async function init() {
    if (!client) { emit({ type: 'unconfigured' }); return null; }
    const { data } = await client.auth.getSession(); user = data.session?.user || null;
    if(user)recordVisit();emit({ type: 'auth', user: publicUser(user) });
    client.auth.onAuthStateChange((_event, session) => { user = session?.user || null;if(user)recordVisit();emit({ type: 'auth', user: publicUser(user) }); });
    window.addEventListener('online', () => emit({ type: 'online', user: publicUser(user) }));
    return publicUser(user);
  }
  window.RoVoCloud = { configured, init, signIn, signOut, sync, markDirty, getUser: () => publicUser(user) };
})();
