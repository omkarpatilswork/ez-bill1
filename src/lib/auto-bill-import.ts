import { supabase } from '@/integrations/supabase/client';
import { smartCategoryFromMerchant, isSubscriptionMerchant } from './smart-category';
import type { ExpenseCategory } from './types';

const CATEGORY_ALIASES: Record<string, string[]> = {
  'food & dining': ['food & dining', 'meals', 'food', 'dining'],
  'petrol & fuel': ['petrol & fuel', 'fuel', 'petrol'],
  'grocery': ['grocery'],
  'shopping': ['shopping'],
  'transportation': ['transportation', 'transport'],
  'travel': ['travel'],
  'accommodation': ['accommodation', 'hotel'],
  'utilities': ['utilities'],
  'software': ['software'],
  'medical': ['medical', 'health'],
  'toll': ['toll'],
  'parking': ['parking'],
  'entertainment': ['entertainment'],
  'education': ['education', 'training'],
  'subscription': ['subscription'],
  'office supplies': ['office supplies'],
  'other': ['other'],
};

function findCategoryByName(name: string, categories: ExpenseCategory[]) {
  if (!name || name === 'Not Found') return null;
  const lower = name.toLowerCase();
  const direct = categories.find(c => c.name.toLowerCase() === lower);
  if (direct) return { id: direct.id, label: direct.name };
  const aliases = CATEGORY_ALIASES[lower] || [lower];
  for (const alias of aliases) {
    const m = categories.find(c => c.name.toLowerCase() === alias);
    if (m) return { id: m.id, label: m.name };
  }
  return null;
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface BillImportResult {
  saved: number;
  skipped: number;
  duplicates: number;
  total: number;
  scanned: number;
  cancelledRemoved?: number;
}

export type BillImportPhase = 'fetching' | 'dedupe' | 'parsing' | 'saving' | 'done';
export interface BillImportProgress {
  phase: BillImportPhase;
  current: number;
  total: number;
  message?: string;
}

export class SyncLockedError extends Error {
  constructor(msg = 'Another sync is already in progress.') {
    super(msg);
    this.name = 'SyncLockedError';
  }
}

export class GmailDisconnectedError extends Error {
  constructor(msg = 'Gmail connection expired. Please reconnect your Gmail account.') {
    super(msg);
    this.name = 'GmailDisconnectedError';
  }
}

const SYNC_LOCK_KIND = 'bill_import';
const SYNC_LOCK_TTL = 600; // 10 minutes

async function acquireSyncLock(): Promise<boolean> {
  const { data, error } = await supabase.rpc('try_acquire_sync_lock' as any, {
    _kind: SYNC_LOCK_KIND, _ttl_seconds: SYNC_LOCK_TTL,
  });
  if (error) {
    console.warn('try_acquire_sync_lock failed:', error.message);
    return false;
  }
  return data === true;
}

async function releaseSyncLock(): Promise<void> {
  await supabase.rpc('release_sync_lock' as any, { _kind: SYNC_LOCK_KIND });
}

/**
 * Reusable bill import core. Scans Gmail for the last `days` days and imports
 * extracted bills as expenses (with dedup).
 */
export type BillImportKind = 'auto' | 'sync_now' | 'manual_30';

export async function runBillImport(opts: {
  userId: string;
  days: number;
  kind?: BillImportKind;
  categories?: ExpenseCategory[];
  maxResults?: number;
  onProgress?: (p: BillImportProgress) => void;
}): Promise<BillImportResult> {
  const { userId, days, kind = 'sync_now', maxResults = 50, onProgress } = opts;
  const emit = (p: BillImportProgress) => { try { onProgress?.(p); } catch {} };

  const acquired = await acquireSyncLock();
  if (!acquired) {
    // Log a 'locked' run for history visibility
    await supabase.from('sync_runs' as any).insert({
      user_id: userId, kind, days, status: 'locked',
      finished_at: new Date().toISOString(),
      error_message: 'Another sync was already running.',
    } as any);
    throw new SyncLockedError();
  }

  const { data: runRow } = await supabase.from('sync_runs' as any).insert({
    user_id: userId, kind, days, status: 'running',
  } as any).select('id').single();
  const runId = (runRow as any)?.id as string | undefined;

  try {
  let categories = opts.categories;
  if (!categories) {
    const { data } = await supabase.from('expense_categories').select('*');
    categories = (data as unknown as ExpenseCategory[]) || [];
  }

  emit({ phase: 'fetching', current: 0, total: 0, message: 'Scanning Gmail inbox…' });
  const { data: scanData, error: scanError } = await supabase.functions.invoke('gmail-scan', {
    body: { max_results: maxResults, days },
  });
  if (scanError) throw new Error('Failed to scan emails');
  if (scanData?.gmail_disconnected) throw new GmailDisconnectedError(scanData.error || undefined);
  if (scanData?.error) throw new Error(scanData.error);

  const emails: Array<{
    message_id: string; subject: string; from: string; date: string;
    attachments: Array<{ id: string; filename: string; mimeType: string; size: number }>;
    body_text?: string;
  }> = scanData?.emails || [];

  const cancellations: Array<{
    message_id: string; subject: string; from: string; date: string;
    order_id?: string; merchant_hint?: string;
  }> = scanData?.cancellations || [];

  // Remove previously-imported expenses that match a cancellation email.
  // Match by Amazon-style order id in description (we store it as "Invoice: <id>"),
  // falling back to merchant hint + recent date window.
  let cancelledRemoved = 0;
  if (cancellations.length > 0) {
    try {
      const sinceISO = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const { data: recent } = await supabase
        .from('expenses')
        .select('id, merchant, description, expense_date')
        .eq('user_id', userId)
        .gte('expense_date', sinceISO);
      const recentList = (recent || []) as any[];
      const toDelete = new Set<string>();
      for (const c of cancellations) {
        const oid = (c.order_id || '').trim();
        const hint = (c.merchant_hint || '').toLowerCase();
        for (const r of recentList) {
          const desc = String(r.description || '');
          const merch = String(r.merchant || '').toLowerCase();
          const matchById = oid && desc.includes(oid);
          const matchByHint = !oid && hint && merch.includes(hint);
          if (matchById || matchByHint) toDelete.add(r.id);
        }
      }
      if (toDelete.size > 0) {
        const ids = Array.from(toDelete);
        const { error: delErr } = await supabase.from('expenses').delete().in('id', ids);
        if (!delErr) cancelledRemoved = ids.length;
      }
    } catch { /* best-effort */ }
  }

  if (emails.length === 0) {
    emit({ phase: 'done', current: 0, total: 0, message: 'No bills found.' });
    if (runId) {
      await supabase.from('sync_runs' as any).update({
        status: 'success', finished_at: new Date().toISOString(),
      } as any).eq('id', runId);
    }
    return { saved: 0, skipped: 0, duplicates: 0, total: 0, scanned: 0, cancelledRemoved } as any;
  }

  let saved = 0, skipped = 0, duplicates = 0, total = 0;
  for (const e of emails) total += Math.max(1, e.attachments.length);

  emit({ phase: 'dedupe', current: 0, total, message: 'Checking for duplicates…' });
  const sinceISO = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from('expenses')
    .select('merchant, amount, expense_date, content_hash')
    .eq('user_id', userId)
    .gte('expense_date', sinceISO);
  const existingHashes = new Set((existing || []).map((e: any) => e.content_hash).filter(Boolean));
  const existingTriples = new Set((existing || []).map((e: any) =>
    `${(e.merchant || '').toLowerCase().trim()}|${Number(e.amount).toFixed(2)}|${e.expense_date}`
  ));

  const { data: processedRows } = await supabase
    .from('processed_emails')
    .select('gmail_message_id')
    .eq('user_id', userId)
    .in('gmail_message_id', emails.map(e => e.message_id));
  const processedMsgs = new Set((processedRows || []).map((r: any) => r.gmail_message_id));

  let processed = 0;
  for (const email of emails) {
    if (processedMsgs.has(email.message_id)) {
      const n = Math.max(1, email.attachments.length);
      duplicates += n;
      processed += n;
      emit({ phase: 'parsing', current: processed, total, message: 'Skipping already-processed email…' });
      continue;
    }

    // If no attachments but we have body text, run a single body-extract pass.
    const units: Array<{ kind: 'attachment' | 'body'; att?: any }> =
      email.attachments.length > 0
        ? email.attachments.map((a) => ({ kind: 'attachment' as const, att: a }))
        : (email.body_text ? [{ kind: 'body' as const }] : []);

    for (const unit of units) {
      processed++;
      const label = unit.kind === 'attachment' ? unit.att.filename : (email.subject || 'email body');
      emit({ phase: 'parsing', current: processed, total, message: `Parsing & OCR: ${label}` });
      try {
        let attData: any = null;
        let ext: any = null;
        if (unit.kind === 'attachment') {
          const r = await supabase.functions.invoke('gmail-attachment', {
            body: { message_id: email.message_id, attachment_id: unit.att.id },
          });
          if (r.error || r.data?.error) { skipped++; continue; }
          attData = r.data;
          const ex = await supabase.functions.invoke('extract-receipt', {
            body: { file_base64: attData.data, file_type: unit.att.mimeType },
          });
          if (ex.error || ex.data?.error) { skipped++; continue; }
          ext = ex.data;
        } else {
          const ex = await supabase.functions.invoke('extract-receipt', {
            body: { text_content: email.body_text, source_hint: `Subject: ${email.subject} | From: ${email.from}` },
          });
          if (ex.error || ex.data?.error) { skipped++; continue; }
          ext = ex.data;
        }

        const amount = ext.amount;
        if (amount == null || amount === 0) { skipped++; continue; }

        const val = (v: any) => (v && v !== 'Not Found' ? v : '');
        const aiCat = findCategoryByName(ext.category, categories);
        const smartName = smartCategoryFromMerchant(ext.merchant_name || '', email.subject);
        const smartCat = smartName === 'Other' ? null : findCategoryByName(smartName, categories);
        const categoryId = aiCat?.id || smartCat?.id || null;
        const categoryLabel = aiCat?.label || smartCat?.label || smartName || 'Other';

        const merchantName = val(ext.merchant_name);
        const invoiceNumber = val(ext.bill_invoice_number);
        const paymentMethod = val(ext.payment_method);
        const lineItems = ext.line_items || [];
        const title = invoiceNumber
          ? `Invoice ${invoiceNumber}`
          : merchantName ? `Expense at ${merchantName}` : email.subject || 'Email Bill';
        const expenseDate = ext.date_time && ext.date_time !== 'Not Found'
          ? ext.date_time.slice(0, 10) : new Date().toISOString().slice(0, 10);

        const triple = `${merchantName.toLowerCase().trim()}|${Number(amount).toFixed(2)}|${expenseDate}`;
        const contentHash = await sha256(`${triple}|${invoiceNumber}`);
        if (existingHashes.has(contentHash) || existingTriples.has(triple)) {
          duplicates++; continue;
        }
        existingHashes.add(contentHash);
        existingTriples.add(triple);

        const isSub = isSubscriptionMerchant(`${merchantName} ${email.subject}`);
        const descParts: string[] = [];
        if (categoryLabel && categoryLabel !== 'Other') descParts.push(`Category: ${categoryLabel}`);
        if (invoiceNumber) descParts.push(`Invoice: ${invoiceNumber}`);
        if (paymentMethod) descParts.push(`Payment: ${paymentMethod}`);
        if (lineItems.length > 0) descParts.push(`${lineItems.length} item(s)`);
        descParts.push(`From email: ${email.subject}`);
        if (isSub) descParts.push('[Subscription]');
        let description = descParts.join(' | ');
        if (lineItems.length > 0) {
          description += `::ITEMS::${JSON.stringify(lineItems)}::END_ITEMS::`;
        }

        emit({ phase: 'saving', current: processed, total, message: `Saving: ${merchantName || title}` });
        const { data: expense, error: insErr } = await supabase.from('expenses').insert({
          user_id: userId,
          title,
          merchant: merchantName,
          amount,
          currency: 'INR',
          expense_date: expenseDate,
          category_id: categoryId,
          description,
          status: 'draft',
          cost_center: isSub ? 'Subscription' : paymentMethod,
          content_hash: contentHash,
        } as any).select().single();

        if (insErr) { skipped++; continue; }
        const expenseId = (expense as any)?.id;

        if (unit.kind === 'attachment' && attData?.data) {
          try {
            const bin = atob(attData.data);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const blob = new Blob([bytes], { type: unit.att.mimeType });
            const filePath = `${userId}/${expenseId}/${unit.att.filename}`;
            const { error: upErr } = await supabase.storage.from('receipts').upload(filePath, blob);
            if (!upErr) {
              await supabase.from('expense_receipts').insert({
                expense_id: expenseId, file_path: filePath, file_name: unit.att.filename,
              } as any);
            }
          } catch (e) { /* ignore upload errors */ }
        }

        await supabase.from('processed_emails').insert({
          user_id: userId,
          gmail_message_id: email.message_id,
          subject: title,
          sender: merchantName || email.from,
          expense_id: expenseId,
        } as any);

        saved++;
      } catch {
        skipped++;
      }
    }
  }

  emit({ phase: 'done', current: total, total, message: 'Sync complete.' });
  const result = { saved, skipped, duplicates, total, scanned: emails.length };
  (result as any).cancelledRemoved = cancelledRemoved;
  if (runId) {
    await supabase.from('sync_runs' as any).update({
      status: 'success', finished_at: new Date().toISOString(),
      saved, skipped, duplicates, total,
    } as any).eq('id', runId);
  }
  return result;
  } catch (err: any) {
    if (runId) {
      await supabase.from('sync_runs' as any).update({
        status: 'failed', finished_at: new Date().toISOString(),
        error_message: String(err?.message || err).slice(0, 500),
      } as any).eq('id', runId);
    }
    throw err;
  } finally {
    await releaseSyncLock().catch(() => {});
  }
}

// ---------- Auto-sync settings (per-user, localStorage) ----------
const todayISO = () => new Date().toISOString().slice(0, 10);
const k = (uid: string, key: string) => `ezbill:autosync:${key}:${uid}`;

export const AutoSync = {
  isEnabled(userId: string) {
    return localStorage.getItem(k(userId, 'enabled')) === '1';
  },
  setEnabled(userId: string, enabled: boolean) {
    localStorage.setItem(k(userId, 'enabled'), enabled ? '1' : '0');
    if (enabled && !localStorage.getItem(k(userId, 'lastSync'))) {
      // Initialize last sync to 30 days ago so first auto-sync covers a 30-day window.
      const start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      localStorage.setItem(k(userId, 'lastSync'), start);
    }
  },
  getLastSync(userId: string) {
    return localStorage.getItem(k(userId, 'lastSync'));
  },
  setLastSync(userId: string, iso: string) {
    localStorage.setItem(k(userId, 'lastSync'), iso);
  },
  getLastRun(userId: string) {
    return localStorage.getItem(k(userId, 'lastRun'));
  },
  setLastRunToday(userId: string) {
    localStorage.setItem(k(userId, 'lastRun'), todayISO());
  },
  hasRunToday(userId: string) {
    return this.getLastRun(userId) === todayISO();
  },
  /** Days to fetch since last sync, capped at 30. */
  computeSyncDays(userId: string): number {
    const last = this.getLastSync(userId);
    if (!last) return 30;
    const diffMs = Date.now() - new Date(last + 'T00:00:00Z').getTime();
    const days = Math.max(1, Math.ceil(diffMs / 86400000));
    return Math.min(30, days);
  },
};