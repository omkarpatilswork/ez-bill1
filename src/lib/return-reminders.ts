// Lightweight client-side reminder system for bill return/warranty windows.
// Stored in localStorage; checked on app load and surfaced via browser
// notifications (when permission granted) plus a small toast hook.

export type ReturnReminder = {
  expense_id: string;
  merchant: string;
  purchase_date: string; // ISO date
  return_window_days: number;
  notify_days_before: number; // e.g. 2 days before window ends
  created_at: string;
  fired_at?: string; // ISO when last fired (to avoid spam)
};

const KEY = 'ezbill.return-reminders.v1';

function readAll(): Record<string, ReturnReminder> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, ReturnReminder>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

export function getReminder(expenseId: string): ReturnReminder | null {
  return readAll()[expenseId] || null;
}

export function setReminder(r: ReturnReminder) {
  const all = readAll();
  all[r.expense_id] = r;
  writeAll(all);
}

export function removeReminder(expenseId: string) {
  const all = readAll();
  delete all[expenseId];
  writeAll(all);
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'default') {
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }
  return Notification.permission;
}

export function reminderEndDate(r: ReturnReminder): Date {
  const d = new Date(r.purchase_date);
  d.setDate(d.getDate() + r.return_window_days);
  return d;
}

export function reminderTriggerDate(r: ReturnReminder): Date {
  const d = reminderEndDate(r);
  d.setDate(d.getDate() - r.notify_days_before);
  return d;
}

// Called once on app mount. Fires browser notifications for any reminders
// whose trigger date has passed and which haven't fired in the last 24h.
export function checkDueReminders() {
  if (typeof window === 'undefined') return;
  const all = readAll();
  const now = new Date();
  let changed = false;

  for (const id of Object.keys(all)) {
    const r = all[id];
    const endDate = reminderEndDate(r);
    // Auto-cleanup expired (more than 1 day past end)
    if (now.getTime() - endDate.getTime() > 24 * 60 * 60 * 1000) {
      delete all[id];
      changed = true;
      continue;
    }
    const trigger = reminderTriggerDate(r);
    if (now < trigger) continue;
    const lastFired = r.fired_at ? new Date(r.fired_at) : null;
    if (lastFired && now.getTime() - lastFired.getTime() < 24 * 60 * 60 * 1000) continue;

    const daysLeft = Math.max(
      0,
      Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    );

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('Return window closing soon', {
          body: `${r.merchant}: ${daysLeft === 0 ? 'last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`} to return.`,
          tag: `return-${r.expense_id}`,
        });
      } catch {
        /* ignore */
      }
    }

    all[id] = { ...r, fired_at: now.toISOString() };
    changed = true;
  }

  if (changed) writeAll(all);
}