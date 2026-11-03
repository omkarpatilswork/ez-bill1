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
  e('Swiggy', 486, '2026-10-22', 'Food'), e('Swiggy', 612, '2026-10-08', 'Food'), e('Blue Tokai Coffee', 412, '2026-10-19', 'Food'), e('Swiggy', 358, '2026-10-28', 'Food'), e('Zomato', 529, '2026-10-30', 'Food'),
  e('Zomato', 744, '2026-10-15', 'Food', 21),
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
const DINNER = OCT.find(r => r.merchant === 'Zomato' && r.amount === 744)!;
DINNER.id = 'dinner-zomato';
DINNER.description = 'Category: Food & Dining | Subtotal: 710 | Tax: 34 | 4 item(s) | ::ITEMS::' + JSON.stringify([
  { name: 'Paneer Tikka', quantity: 1, unit_price: 280, total_price: 280 },
  { name: 'Dal Makhani', quantity: 1, unit_price: 220, total_price: 220 },
  { name: 'Garlic Naan', quantity: 2, unit_price: 60, total_price: 120 },
  { name: 'Sweet Lassi', quantity: 1, unit_price: 90, total_price: 90 }]) + '::END_ITEMS::';
const FRIENDS = [{ id: 'f-rohan', user_id: UID, name: 'Rohan' }, { id: 'f-parth', user_id: UID, name: 'Parth' }, { id: 'f-aditi', user_id: UID, name: 'Aditi' }];
const SPLITS = [
  { id: 's1', user_id: UID, expense_id: 'dinner-zomato', is_self: true, friend_id: null, friend_name: 'You', items: [3], amount: 0 },
  { id: 's2', user_id: UID, expense_id: 'dinner-zomato', is_self: false, friend_id: 'f-rohan', friend_name: 'Rohan', items: [0, 2], amount: 0 },
  { id: 's3', user_id: UID, expense_id: 'dinner-zomato', is_self: false, friend_id: 'f-parth', friend_name: 'Parth', items: [1, 2], amount: 0 }];
const sub = (k: string, name: string, cat: string, amt: number, last: string, next: string, n: number, start = '2026-01-01') => ({ id: 'sub-' + k, user_id: UID, service_key: k, service_name: name, category: cat, source: 'gmail',
  email_status: 'active', user_confirmed_status: 'subscribed', last_email_subject: 'Your ' + name + ' payment', last_email_from: k + '@billing', last_email_date: last, last_amount: amt, email_count: n,
  created_at: '2026-06-01T00:00:00Z', next_billing_date: next, billing_cycle: 'monthly', currency: 'INR', is_trial: false, trial_ends_at: null, started_at: start, last_email_snippet: null, user_edited: false });
const SUBS = [sub('netflix', 'Netflix', 'OTT', 649, '2026-10-02', '2026-11-02', 10, '2025-08-02'), sub('primevideo', 'Prime Video', 'OTT', 299, '2026-10-07', '2026-11-07', 10, '2025-11-07'),
  sub('hotstar', 'Disney+ Hotstar', 'OTT', 299, '2026-10-16', '2026-11-16', 6, '2026-05-16'), sub('spotify', 'Spotify', 'Music', 119, '2026-10-11', '2026-11-11', 10, '2024-03-11'),
  sub('youtube', 'YouTube Premium', 'Music', 149, '2026-10-18', '2026-11-18', 8, '2026-03-18'), sub('chatgpt', 'ChatGPT Plus', 'AI', 1999, '2026-10-14', '2026-11-14', 9, '2026-02-14'),
  sub('notion', 'Notion', 'Productivity', 850, '2026-10-20', '2026-11-20', 5, '2026-06-20'), sub('cult', 'Cult gym membership', 'Fitness', 1499, '2026-10-01', '2026-11-01', 10, '2025-12-01')];
const WARRANTIES = [
  { id: 'w1', user_id: UID, product_name: 'Airdopes 141 earbuds', brand: 'boAt', model_number: null, serial_number: null, category: 'Electronics', purchase_date: '2026-10-09', expiry_date: '2027-10-09', warranty_months: 12, retailer: 'Amazon', notes: null, qr_url: null, support_url: null, image_path: null, source: 'gmail', created_at: '2026-10-09T10:00:00Z' },
  { id: 'w2', user_id: UID, product_name: 'Air fryer', brand: 'Philips', model_number: null, serial_number: null, category: 'Appliances', purchase_date: '2026-10-17', expiry_date: '2028-10-17', warranty_months: 24, retailer: 'Amazon', notes: null, qr_url: null, support_url: null, image_path: null, source: 'gmail', created_at: '2026-10-17T10:00:00Z' }];
const profile: Row = { id: UID, user_id: UID, full_name: 'Demo', email: user.email, onboarding_completed: true, money_profile_completed: true,
  income_range: '50-100k', age_group: '25-34', city_tier: 'tier_1', living_situation: 'shared', job_type: 'office', financial_goal: 'balanced',
  monthly_rent: 20000, monthly_emi: 0, default_currency: 'INR', currency: 'INR', country: 'IN', theme: 'dark', leak_alerts_enabled: false, created_at: '2026-01-01T00:00:00Z' };
const DB: Record<string, Row[]> = {
  profiles: [profile], user_roles: [{ user_id: UID, role: 'employee' }], expenses: [...OCT, ...SEP],
  expense_categories: Object.entries(catName).map(([id, name]) => ({ id, name, description: '' })),
  friends: FRIENDS, bill_splits: SPLITS, split_payments: [], detected_subscriptions: SUBS, warranties: WARRANTIES, processed_emails: [],
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
  functions: { invoke: async (name: string, opts?: any) => name === 'gmail-auth' && opts?.body?.action === 'status' ? ({ data: { connected: true, email: 'demo@gmail.com' }, error: null }) : ({ data: null, error: null }) },
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }), createSignedUrl: async () => ({ data: null, error: null }), upload: async () => ({ data: null, error: null }), download: async () => ({ data: null, error: null }) }) },
  channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }), removeChannel: () => {},
};
