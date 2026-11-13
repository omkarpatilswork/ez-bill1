/**
 * The one demo world used for every screenshot (CLAUDE.md, "Screenshots and demo data").
 *
 *   Aarav Mehta, Pune. It is 13:20 on Monday 19 Oct 2026 and a bill from
 *   Blue Tokai Coffee, Koregaon Park, Table 3 has just arrived by NFC Airdrop:
 *   2 Cappuccino 320 + 1 Almond Croissant 92 = 412, paid by UPI.
 *
 * Nothing here is real: no real person, account or purchase. Rows are stored
 * exactly the way the app stores them today (line items packed into
 * `description`), so the screens are exercised against the real format.
 */

export const NOW = '2026-10-19T13:20:00+05:30';
export const USER_ID = '0a11ce00-0000-4000-8000-0000000000a1';
export const BLUE_TOKAI_ID = 'b111e000-0000-4000-8000-000000000001';
export const CROMA_ID = 'b111e000-0000-4000-8000-000000000006';

export const user = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'aarav.mehta@example.com',
  email_confirmed_at: '2026-06-02T09:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Aarav Mehta' },
  created_at: '2026-06-02T09:00:00Z',
};

export const profile = {
  id: USER_ID,
  full_name: 'Aarav Mehta',
  display_name: 'Aarav',
  phone: null,
  phone_verified: false,
  country: 'IN',
  default_currency: 'INR',
  onboarding_completed: true,
  terms_accepted_at: '2026-06-02T09:00:00Z',
  department: '',
  manager_id: null,
  // Money profile (the six questions) so Money Leaks has a plan to measure against.
  money_profile_completed: true,
  income_range: '25-50k',
  age_group: '25-34',
  city_tier: 'tier_1',
  living_situation: 'shared',
  job_type: 'office',
  financial_goal: 'balanced',
  monthly_rent: 14000,
  monthly_emi: 0,
  leak_alerts_enabled: true,
  salary_day: 1,
  survival_balance: null,
  created_at: '2026-06-02T09:00:00Z',
  updated_at: '2026-10-01T09:00:00Z',
};

const items = (list) => `::ITEMS::${JSON.stringify(list.map(([name, quantity, unit_price]) => ({ name, quantity, unit_price, total_price: Math.round(quantity * unit_price * 100) / 100 })))}::END_ITEMS::`;

let n = 0;
/** date: YYYY-MM-DD, time: HH:MM (IST) the bill was added. */
function bill(date, time, merchant, amount, category, pay, head, list = [], id) {
  n += 1;
  return {
    id: id ?? `b111e000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    user_id: USER_ID,
    title: merchant,
    merchant,
    amount,
    currency: 'INR',
    original_currency: null,
    converted_amount: null,
    conversion_rate: null,
    expense_date: date,
    category_id: null,
    expense_categories: { name: category },
    cost_center: pay,
    status: 'draft',
    content_hash: null,
    description: `Category: ${category} | ${head}${list.length ? items(list) : ''}`,
    created_at: `${date}T${time}:00+05:30`,
    updated_at: `${date}T${time}:00+05:30`,
  };
}

const gmail = (subject) => `Payment: UPI | From email: ${subject}`;

/* ---------- the last 30 days: 34 bills, 25,916 in all ---------- */
const last30 = [
  bill('2026-10-19', '13:20', 'Blue Tokai Coffee', 412, 'Food & Dining', 'UPI',
    'Address: Koregaon Park | Tapped at Table 3 | Auto-delivered via NFC tag | [nfc] | Invoice: BT-KP-1910-0342 | Payment: UPI',
    [['Cappuccino', 2, 160], ['Almond Croissant', 1, 92]], BLUE_TOKAI_ID),
  bill('2026-10-18', '21:42', 'Swiggy', 684, 'Food & Dining', 'UPI', gmail('Your Swiggy order was delivered'), [['Chicken Biryani', 1, 349], ['Paneer Tikka', 1, 289], ['Delivery and platform fee', 1, 46]]),
  bill('2026-10-18', '09:12', 'Uber', 286, 'Transport', 'UPI', gmail('Your Sunday morning trip with Uber')),
  bill('2026-10-17', '20:55', 'Swiggy', 640, 'Food & Dining', 'UPI', gmail('Your Swiggy order was delivered')),
  bill('2026-10-17', '11:08', 'Blinkit', 1148, 'Grocery', 'UPI', gmail('Your Blinkit order is on the way')),
  bill('2026-10-16', '18:31', 'Croma', 1299, 'Shopping', 'Credit Card',
    'Address: Phoenix Marketcity, Viman Nagar | Invoice: CR/PNQ/26/118204 | Payment: Credit Card | 1 item(s) | Subtotal: 1100.85 | Tax: 198.15 | TaxDetails: CGST 9% + SGST 9% | [scan]',
    [['boAt Airdopes 141', 1, 1100.85]], CROMA_ID),
  bill('2026-10-15', '13:40', 'Zomato', 520, 'Food & Dining', 'UPI', gmail('Your Zomato order from Vohuman Cafe')),
  bill('2026-10-14', '19:05', 'Rapido', 96, 'Transport', 'UPI', gmail('Your Rapido ride receipt')),
  bill('2026-10-13', '21:15', 'Swiggy', 456, 'Food & Dining', 'UPI', gmail('Your Swiggy order was delivered')),
  bill('2026-10-12', '10:22', 'Third Wave Coffee', 380, 'Food & Dining', 'UPI', 'Payment: UPI | [scan]', [['Flat White', 1, 220], ['Banana Bread', 1, 160]]),
  bill('2026-10-11', '08:47', 'HP Petrol Pump', 1500, 'Fuel', 'Credit Card', 'Payment: Credit Card | [scan]'),
  bill('2026-10-10', '20:30', 'Zomato', 890, 'Food & Dining', 'UPI', gmail('Your Zomato order from Malaka Spice')),
  bill('2026-10-10', '12:02', 'Amazon', 2174, 'Shopping', 'Credit Card', 'Payment: Credit Card | From email: Your Amazon.in order has shipped'),
  bill('2026-10-09', '18:50', 'Uber', 342, 'Transport', 'UPI', gmail('Your Friday evening trip with Uber')),
  bill('2026-10-08', '21:20', 'Swiggy', 712, 'Food & Dining', 'UPI', gmail('Your Swiggy order was delivered')),
  bill('2026-10-07', '09:00', 'Airtel', 799, 'Utilities', 'UPI', gmail('Your Airtel bill payment was successful')),
  bill('2026-10-06', '19:44', 'Blinkit', 964, 'Grocery', 'UPI', gmail('Your Blinkit order is on the way')),
  bill('2026-10-05', '22:10', 'Koregaon Park SOCIAL', 1594, 'Food & Dining', 'Credit Card', 'Payment: Credit Card | [scan]'),
  bill('2026-10-04', '16:05', 'BookMyShow', 620, 'Entertainment', 'UPI', gmail('Your booking is confirmed')),
  bill('2026-10-03', '20:48', 'Swiggy', 598, 'Food & Dining', 'UPI', gmail('Your Swiggy order was delivered')),
  bill('2026-10-02', '07:30', 'Spotify', 119, 'Subscriptions', 'UPI', 'Payment: UPI | From email: Your Spotify Premium receipt | [Subscription]'),
  bill('2026-10-01', '18:15', 'Zepto', 742, 'Grocery', 'UPI', gmail('Your Zepto order receipt')),
  bill('2026-09-30', '09:25', 'Uber', 264, 'Transport', 'UPI', gmail('Your Wednesday morning trip with Uber')),
  bill('2026-09-29', '21:05', 'Swiggy', 548, 'Food & Dining', 'UPI', gmail('Your Swiggy order was delivered')),
  bill('2026-09-28', '17:20', 'Decathlon', 1499, 'Shopping', 'Debit Card', 'Payment: Debit Card | [scan]'),
  bill('2026-09-27', '20:40', 'Zomato', 630, 'Food & Dining', 'UPI', gmail('Your Zomato order from Burger Barn')),
  bill('2026-09-26', '11:10', 'Apollo Pharmacy', 385, 'Medical', 'UPI', 'Payment: UPI | [scan]'),
  bill('2026-09-25', '19:30', 'Blinkit', 1022, 'Grocery', 'UPI', gmail('Your Blinkit order is on the way')),
  bill('2026-09-24', '06:50', 'IRCTC', 1500, 'Travel', 'UPI', gmail('Booking confirmation: Pune Jn to Mumbai CSMT')),
  bill('2026-09-23', '21:22', 'Swiggy', 476, 'Food & Dining', 'UPI', gmail('Your Swiggy order was delivered')),
  bill('2026-09-22', '08:00', 'Netflix', 649, 'Subscriptions', 'Credit Card', 'Payment: Credit Card | From email: Your Netflix receipt | [Subscription]'),
  bill('2026-09-22', '17:35', 'Starbucks', 590, 'Food & Dining', 'UPI', 'Payment: UPI | [scan]'),
  bill('2026-09-21', '10:15', 'MSEDCL', 1180, 'Utilities', 'UPI', gmail('Electricity bill payment receipt')),
  bill('2026-09-20', '19:00', 'Uber', 198, 'Transport', 'UPI', gmail('Your Sunday evening trip with Uber')),
];

/* ---------- the 30 days before that: 38,112, so spending is down 32% ---------- */
const before = [
  bill('2026-09-18', '20:10', 'Swiggy', 702, 'Food & Dining', 'UPI', gmail('Your Swiggy order was delivered')),
  bill('2026-09-15', '13:00', 'IndiGo', 6480, 'Travel', 'Credit Card', 'Payment: Credit Card | From email: Your IndiGo itinerary: Pune to Bengaluru'),
  bill('2026-09-13', '19:30', 'Zomato', 940, 'Food & Dining', 'UPI', gmail('Your Zomato order from Malaka Spice')),
  bill('2026-09-11', '11:45', 'Amazon', 3299, 'Shopping', 'Credit Card', 'Payment: Credit Card | From email: Your Amazon.in order has shipped'),
  bill('2026-09-09', '18:20', 'Blinkit', 1310, 'Grocery', 'UPI', gmail('Your Blinkit order is on the way')),
  bill('2026-09-07', '09:00', 'Airtel', 799, 'Utilities', 'UPI', gmail('Your Airtel bill payment was successful')),
  bill('2026-09-05', '21:00', 'Swiggy', 812, 'Food & Dining', 'UPI', gmail('Your Swiggy order was delivered')),
  bill('2026-09-02', '07:30', 'Spotify', 119, 'Subscriptions', 'UPI', 'Payment: UPI | From email: Your Spotify Premium receipt | [Subscription]'),
  bill('2026-08-30', '16:40', 'Lenskart', 4200, 'Shopping', 'Credit Card', 'Payment: Credit Card | [scan]'),
  bill('2026-08-28', '14:10', 'Treebo Hotels', 8650, 'Hotel & Stay', 'Credit Card', 'Payment: Credit Card | From email: Your stay in Bengaluru is confirmed'),
  bill('2026-08-26', '20:30', 'Zomato', 1120, 'Food & Dining', 'UPI', gmail('Your Zomato order from Burger Barn')),
  bill('2026-08-24', '10:05', 'Myntra', 5380, 'Shopping', 'Credit Card', 'Payment: Credit Card | From email: Your Myntra order is confirmed'),
  bill('2026-08-22', '08:00', 'Netflix', 649, 'Subscriptions', 'Credit Card', 'Payment: Credit Card | From email: Your Netflix receipt | [Subscription]'),
  bill('2026-08-21', '19:15', 'Uber', 3652, 'Transport', 'UPI', gmail('Your airport trip with Uber')),
];

export const bills = [...last30, ...before];

export const receipts = [
  { id: 'c0000000-0000-4000-8000-000000000001', expense_id: BLUE_TOKAI_ID, file_path: `${USER_ID}/${BLUE_TOKAI_ID}/bill-table-3.jpg`, file_name: 'bill-table-3.jpg', uploaded_at: '2026-10-19T13:20:00+05:30' },
  { id: 'c0000000-0000-4000-8000-000000000002', expense_id: CROMA_ID, file_path: `${USER_ID}/${CROMA_ID}/croma-invoice.jpg`, file_name: 'croma-invoice.jpg', uploaded_at: '2026-10-16T18:31:00+05:30' },
];

export const subscriptions = [
  { id: 'd0000000-0000-4000-8000-000000000001', user_id: USER_ID, service_key: 'netflix', service_name: 'Netflix', category: 'Entertainment', last_amount: 649, currency: 'INR', billing_cycle: 'monthly', next_billing_date: '2026-10-22', email_status: 'active', user_confirmed_status: 'subscribed', source: 'gmail', is_trial: false },
  { id: 'd0000000-0000-4000-8000-000000000002', user_id: USER_ID, service_key: 'spotify', service_name: 'Spotify', category: 'Music', last_amount: 119, currency: 'INR', billing_cycle: 'monthly', next_billing_date: '2026-11-02', email_status: 'active', user_confirmed_status: 'subscribed', source: 'gmail', is_trial: false },
];

export const warranties = [
  { id: 'e0000000-0000-4000-8000-000000000001', user_id: USER_ID, product_name: 'Logitech MX Master 3S', brand: 'Logitech', retailer: 'Amazon', purchase_date: '2025-10-31', warranty_months: 12, expiry_date: '2026-10-31', source: 'gmail' },
  { id: 'e0000000-0000-4000-8000-000000000002', user_id: USER_ID, product_name: 'boAt Airdopes 141', brand: 'boAt', retailer: 'Croma', purchase_date: '2026-10-16', warranty_months: 12, expiry_date: '2027-10-16', source: 'manual' },
];

/** Return reminders live in the browser (localStorage key ezbill.return-reminders.v1). */
export const returnReminders = {
  [CROMA_ID]: { expense_id: CROMA_ID, merchant: 'Croma', purchase_date: '2026-10-16', return_window_days: 7, notify_days_before: 2, created_at: '2026-10-16T18:35:00+05:30' },
};
