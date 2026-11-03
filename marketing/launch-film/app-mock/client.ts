// FILM CAPTURE ONLY: stands in for the Supabase client so the app's own code renders demo data offline.
// Every number the app shows is computed by its real engines (leak-engine, subscription-engine) from these rows.
type Row = Record<string, any>;
const UID = 'demo-user';
const user = { id: UID, email: 'demo@ezzbill.com', user_metadata: { full_name: 'Demo' }, app_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' };
const session = { access_token: 'demo', refresh_token: 'demo', expires_in: 3600, expires_at: 9999999999, token_type: 'bearer', user };
const CAT: Record<string, string> = { Food: 'c-food', Travel: 'c-travel', Shopping: 'c-shop', Subscriptions: 'c-subs', Utilities: 'c-util', Other: 'c-other' };
const catName: Record<string, string> = { 'c-food': 'Food & Dining', 'c-travel': 'Travel', 'c-shop': 'Shopping', 'c-subs': 'Subscriptions', 'c-util': 'Utilities', 'c-other': 'Other' };
let n = 0;
const e = (merchant: string, amount: number, date: string, cat: string, hour = 13): Row => {
  n += 1; const cid = CAT[cat];
  return { id: 'e' + n, user_id: UID, title: merchant, description: `Category: ${catName[cid]}`, amount, currency: 'INR', original_currency: null, converted_amount: null, conversion_rate: null,
    merchant, expense_date: date, category_id: cid, cost_center: '', status: 'approved', payment_method: 'UPI', source: 'email',
    created_at: `${date}T${String(hour).padStart(2, '0')}:10:00+05:30`, updated_at: `${date}T${String(hour).padStart(2, '0')}:10:00+05:30`,
    expense_categories: { name: catName[cid] }, category: { id: cid, name: catName[cid], description: '' } };
};
const OCT = [
  // Shopping 9,896 (ideal 7,150 -> +2,746)
  e('Myntra', 2499, '2026-10-04', 'Shopping'), e('Amazon', 1899, '2026-10-09', 'Shopping'), e('Amazon', 3149, '2026-10-17', 'Shopping'), e('Nykaa', 1249, '2026-10-22', 'Shopping'), e('Ajio', 1100, '2026-10-26', 'Shopping'),
  // Subscriptions 5,863 (ideal 3,850 -> +2,013)
  e('Netflix', 649, '2026-10-02', 'Subscriptions'), e('Prime Video', 299, '2026-10-07', 'Subscriptions'), e('Spotify', 119, '2026-10-11', 'Subscriptions'), e('ChatGPT Plus', 1999, '2026-10-14', 'Subscriptions'),
  e('Disney+ Hotstar', 299, '2026-10-16', 'Subscriptions'), e('YouTube Premium', 149, '2026-10-18', 'Subscriptions'), e('Cult gym membership', 1499, '2026-10-01', 'Subscriptions'), e('Notion', 850, '2026-10-20', 'Subscriptions'),
  // Misc 8,006 (ideal 7,150 -> +856)
  e('Blinkit', 1240, '2026-10-05', 'Other'), e('Blinkit', 986, '2026-10-19', 'Other'), e('Zepto', 642, '2026-10-12', 'Other'), e('Zepto', 489, '2026-10-25', 'Other'),
  e('Urban Company', 1499, '2026-10-13', 'Other'), e('BookMyShow', 1150, '2026-10-24', 'Other'), e('Decathlon', 1000, '2026-10-27', 'Other'), e('PharmEasy', 1000, '2026-10-21', 'Other'),
  // Food 3,141 (ideal 15,972: on track)
  e('Swiggy', 486, '2026-10-22', 'Food'), e('Swiggy', 612, '2026-10-08', 'Food'), e('Zomato', 744, '2026-10-15', 'Food'), e('Blue Tokai Coffee', 412, '2026-10-19', 'Food'), e('Swiggy', 358, '2026-10-28', 'Food'), e('Zomato', 529, '2026-10-30', 'Food'),
  // Travel 930, Utilities 1,809 (on track)
  e('Uber', 312, '2026-10-22', 'Travel'), e('Uber', 284, '2026-10-10', 'Travel'), e('Rapido', 89, '2026-10-23', 'Travel'), e('Ola', 245, '2026-10-29', 'Travel'),
  e('Airtel', 599, '2026-10-03', 'Utilities'), e('BESCOM electricity', 1210, '2026-10-06', 'Utilities'),
];
const SEP = [
  e('Amazon', 4210, '2026-09-12', 'Shopping'), e('Myntra', 2190, '2026-09-20', 'Shopping'),
  e('Netflix', 649, '2026-09-02', 'Subscriptions'), e('Prime Video', 299, '2026-09-07', 'Subscriptions'), e('Spotify', 119, '2026-09-11', 'Subscriptions'), e('ChatGPT Plus', 1999, '2026-09-14', 'Subscriptions'),
  e('Disney+ Hotstar', 299, '2026-09-16', 'Subscriptions'), e('YouTube Premium', 149, '2026-09-18', 'Subscriptions'), e('Cult gym membership', 1499, '2026-09-01', 'Subscriptions'), e('Notion', 850, '2026-09-20', 'Subscriptions'),
  e('Blinkit', 1630, '2026-09-09', 'Other'), e('Zepto', 820, '2026-09-23', 'Other'), e('Urban Company', 999, '2026-09-15', 'Other'),
  e('Swiggy', 540, '2026-09-08', 'Food'), e('Zomato', 690, '2026-09-19', 'Food'), e('Uber', 410, '2026-09-10', 'Travel'), e('Airtel', 599, '2026-09-03', 'Utilities'), e('BESCOM electricity', 1340, '2026-09-06', 'Utilities'),
];
const profile: Row = { id: UID, user_id: UID, full_name: 'Demo', email: user.email, onboarding_completed: true, money_profile_completed: true,
  income_range: '50-100k', age_group: '25-34', city_tier: 'tier_1', living_situation: 'shared', job_type: 'office', financial_goal: 'balanced',
  monthly_rent: 20000, monthly_emi: 0, default_currency: 'INR', currency: 'INR', country: 'IN', theme: 'dark', leak_alerts_enabled: false, created_at: '2026-01-01T00:00:00Z' };
const DB: Record<string, Row[]> = {
  profiles: [profile], user_roles: [{ user_id: UID, role: 'employee' }], expenses: [...OCT, ...SEP],
  expense_categories: Object.entries(catName).map(([id, name]) => ({ id, name, description: '' })),
};
function builder(table: string) {
  const st: any = { filters: [], single: false, order: null, limit: null, write: false };
  const run = () => {
    if (st.write) return { data: null, error: null };
    let rows = (DB[table] || []).filter(r => st.filters.every((f: any) => f(r)));
    if (st.order) { const [k, asc] = st.order; rows = [...rows].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1)); }
    if (st.limit != null) rows = rows.slice(0, st.limit);
    if (st.single) return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found' } };
    return { data: rows, error: null, count: rows.length };
  };
  const p: any = new Proxy({}, { get(_t, k: string) {
    if (k === 'then') return (res: any, rej: any) => Promise.resolve(run()).then(res, rej);
    if (k === 'eq') return (a: string, b: any) => { st.filters.push((r: Row) => !(a in r) || r[a] === b); return p; };
    if (k === 'in') return (a: string, b: any[]) => { st.filters.push((r: Row) => !(a in r) || b.includes(r[a])); return p; };
    if (k === 'gte') return (a: string, b: any) => { st.filters.push((r: Row) => !(a in r) || r[a] >= b); return p; };
    if (k === 'lte') return (a: string, b: any) => { st.filters.push((r: Row) => !(a in r) || r[a] <= b); return p; };
    if (k === 'lt') return (a: string, b: any) => { st.filters.push((r: Row) => !(a in r) || r[a] < b); return p; };
    if (k === 'gt') return (a: string, b: any) => { st.filters.push((r: Row) => !(a in r) || r[a] > b); return p; };
    if (k === 'single' || k === 'maybeSingle') return () => { st.single = true; return p; };
    if (k === 'order') return (c: string, o?: any) => { st.order = [c, o?.ascending !== false]; return p; };
    if (k === 'limit') return (x: number) => { st.limit = x; return p; };
    if (['insert', 'update', 'upsert', 'delete'].includes(k)) return () => { st.write = true; return p; };
    return () => p;
  } });
  return p;
}
const noop: any = new Proxy(function () {}, { get: () => noop, apply: () => noop });
export const supabase: any = {
  from: builder,
  rpc: async () => ({ data: null, error: null }),
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => ({ data: { user }, error: null }),
    onAuthStateChange: (cb: any) => { setTimeout(() => cb('SIGNED_IN', session), 0); return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: async () => ({ error: null }), signInWithPassword: async () => ({ error: null }), signUp: async () => ({ error: null }),
  },
  functions: { invoke: async () => ({ data: null, error: null }) },
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }), createSignedUrl: async () => ({ data: null, error: null }), upload: async () => ({ data: null, error: null }), download: async () => ({ data: null, error: null }) }) },
  channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }), removeChannel: () => {},
};
