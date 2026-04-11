/**
 * Shared merchant → category mapping used across scan, Gmail import, and All Bills listing.
 */

export const MERCHANT_CATEGORY_MAP: Record<string, string> = {
  // Food & Dining
  swiggy: 'Food & Dining', zomato: 'Food & Dining', dominos: 'Food & Dining', "domino's": 'Food & Dining',
  "mcdonald's": 'Food & Dining', mcdonalds: 'Food & Dining', kfc: 'Food & Dining', 'burger king': 'Food & Dining',
  'pizza hut': 'Food & Dining', starbucks: 'Food & Dining', 'cafe coffee day': 'Food & Dining',
  dunkin: 'Food & Dining', subway: 'Food & Dining', haldirams: 'Food & Dining', barbeque: 'Food & Dining',
  // Grocery
  bigbasket: 'Grocery', blinkit: 'Grocery', zepto: 'Grocery', jiomart: 'Grocery',
  dmart: 'Grocery', 'nature basket': 'Grocery', dunzo: 'Grocery', 'swiggy instamart': 'Grocery',
  // Shopping
  amazon: 'Shopping', flipkart: 'Shopping', myntra: 'Shopping', ajio: 'Shopping',
  meesho: 'Shopping', nykaa: 'Shopping', tatacliq: 'Shopping',
  // Transportation
  uber: 'Transportation', ola: 'Transportation', rapido: 'Transportation',
  // Software / Subscriptions
  netflix: 'Software', hotstar: 'Software', spotify: 'Software', 'prime video': 'Software',
  'youtube premium': 'Software', 'apple music': 'Software', zee5: 'Software',
  'sony liv': 'Software', 'amazon prime': 'Software', 'disney+': 'Software',
  chatgpt: 'Software', notion: 'Software', figma: 'Software', canva: 'Software',
  // Utilities
  jio: 'Utilities', airtel: 'Utilities', vi: 'Utilities', bsnl: 'Utilities',
  'tata play': 'Utilities', 'dish tv': 'Utilities', 'act fibernet': 'Utilities',
  // Fuel
  hpcl: 'Petrol & Fuel', bpcl: 'Petrol & Fuel', iocl: 'Petrol & Fuel', 'indian oil': 'Petrol & Fuel',
  'hp petrol': 'Petrol & Fuel', 'bharat petroleum': 'Petrol & Fuel', 'shell': 'Petrol & Fuel',
  // Travel
  makemytrip: 'Travel', cleartrip: 'Travel', yatra: 'Travel', ixigo: 'Travel',
  irctc: 'Travel', goibibo: 'Travel',
  // Accommodation
  oyo: 'Accommodation', airbnb: 'Accommodation', treebo: 'Accommodation',
  // Medical
  '1mg': 'Medical', pharmeasy: 'Medical', netmeds: 'Medical', apollo: 'Medical',
};

/**
 * Given a merchant name (and optionally subject/title), returns the best category label.
 */
export function smartCategoryFromMerchant(merchant: string, extra?: string): string {
  const text = `${merchant} ${extra || ''}`.toLowerCase();
  for (const [keyword, category] of Object.entries(MERCHANT_CATEGORY_MAP)) {
    if (text.includes(keyword)) return category;
  }
  // Fallback pattern matching
  if (/food|dining|restaurant|cafe|pizza|burger|biryani|thali/.test(text)) return 'Food & Dining';
  if (/petrol|fuel|gas|diesel|petroleum/.test(text)) return 'Petrol & Fuel';
  if (/toll|fastag|highway/.test(text)) return 'Toll';
  if (/parking|park/.test(text)) return 'Parking';
  if (/shopping|retail|store|mall/.test(text)) return 'Shopping';
  if (/utilities|electric|water|internet|broadband|phone|recharge/.test(text)) return 'Utilities';
  if (/grocery|supermarket|kirana/.test(text)) return 'Grocery';
  if (/travel|flight|airline|train|bus/.test(text)) return 'Travel';
  if (/hotel|resort|lodge|stay/.test(text)) return 'Accommodation';
  if (/medical|hospital|doctor|clinic|pharmacy/.test(text)) return 'Medical';
  return 'Other';
}

export const SUBSCRIPTION_MERCHANTS = [
  'netflix', 'hotstar', 'spotify', 'prime video', 'youtube premium', 'apple music',
  'zee5', 'sony liv', 'disney+', 'amazon prime', 'chatgpt', 'notion', 'figma', 'canva',
  'jio', 'airtel', 'vi', 'bsnl', 'tata play', 'dish tv', 'act fibernet',
  'credit card', 'hdfc card', 'icici card', 'sbi card', 'axis card', 'kotak card',
  'amex', 'citi card', 'insurance', 'lic', 'term plan',
];

export function isSubscriptionMerchant(text: string): boolean {
  const lower = text.toLowerCase();
  return SUBSCRIPTION_MERCHANTS.some(s => lower.includes(s));
}
