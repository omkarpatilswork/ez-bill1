/**
 * Catalog of popular subscription services across categories.
 * Used on the Subscriptions page to surface "things people typically subscribe to"
 * and let us quickly check which ones the user has actively been paying for.
 */

export type PopularCategory =
  | 'OTT'
  | 'Music'
  | 'SaaS'
  | 'Cloud'
  | 'AI'
  | 'Telecom'
  | 'Fitness'
  | 'Membership'
  | 'News'
  | 'Gaming';

export interface PopularService {
  name: string;       // canonical display name
  category: PopularCategory;
  match: string[];    // lowercase substrings to match against merchant/title
  emoji: string;      // quick-glance avatar (no external assets required)
  typical?: number;   // typical monthly cost in INR (rough)
  cancelUrl?: string;
}

export const POPULAR_SERVICES: PopularService[] = [
  // OTT / Video
  { name: 'Netflix',           category: 'OTT',        match: ['netflix'],                       emoji: '🎬', typical: 499, cancelUrl: 'https://www.netflix.com/cancelplan' },
  { name: 'Amazon Prime Video',category: 'OTT',        match: ['prime video', 'amazon prime'],   emoji: '📺', typical: 299, cancelUrl: 'https://www.amazon.in/gp/video/settings' },
  { name: 'Disney+ Hotstar',   category: 'OTT',        match: ['hotstar', 'disney'],             emoji: '⭐', typical: 299, cancelUrl: 'https://www.hotstar.com/in/subscribe/myaccount' },
  { name: 'JioCinema',         category: 'OTT',        match: ['jio cinema', 'jiocinema'],       emoji: '🎞️', typical: 99 },
  { name: 'Sony LIV',          category: 'OTT',        match: ['sony liv', 'sonyliv'],           emoji: '🎥', typical: 299 },
  { name: 'Zee5',              category: 'OTT',        match: ['zee5', 'zee 5'],                 emoji: '🎬', typical: 99 },
  { name: 'YouTube Premium',   category: 'OTT',        match: ['youtube premium', 'youtube'],    emoji: '▶️', typical: 129, cancelUrl: 'https://www.youtube.com/paid_memberships' },

  // Music
  { name: 'Spotify',           category: 'Music',      match: ['spotify'],                       emoji: '🎵', typical: 119, cancelUrl: 'https://www.spotify.com/account/subscription/' },
  { name: 'Apple Music',       category: 'Music',      match: ['apple music'],                   emoji: '🎶', typical: 99 },
  { name: 'Gaana',             category: 'Music',      match: ['gaana'],                         emoji: '🎧', typical: 99 },
  { name: 'Wynk Music',        category: 'Music',      match: ['wynk'],                          emoji: '🎼', typical: 99 },

  // Cloud / Drive
  { name: 'Google One',        category: 'Cloud',      match: ['google one', 'google storage'],  emoji: '☁️', typical: 130 },
  { name: 'iCloud+',           category: 'Cloud',      match: ['icloud', 'apple icloud'],        emoji: '🍎', typical: 75 },
  { name: 'Dropbox',           category: 'Cloud',      match: ['dropbox'],                       emoji: '📦', typical: 999 },
  { name: 'OneDrive',          category: 'Cloud',      match: ['onedrive', 'microsoft 365'],     emoji: '🗂️', typical: 489 },

  // SaaS / Productivity
  { name: 'Notion',            category: 'SaaS',       match: ['notion'],                        emoji: '📝', typical: 800, cancelUrl: 'https://www.notion.so/my-account' },
  { name: 'Figma',             category: 'SaaS',       match: ['figma'],                         emoji: '🎨', typical: 1200, cancelUrl: 'https://www.figma.com/settings' },
  { name: 'Canva Pro',         category: 'SaaS',       match: ['canva'],                         emoji: '🖼️', typical: 499, cancelUrl: 'https://www.canva.com/settings/billing-and-plans' },
  { name: 'Adobe Creative Cloud', category: 'SaaS',    match: ['adobe'],                         emoji: '🅰️', typical: 1675, cancelUrl: 'https://account.adobe.com/plans' },
  { name: 'GitHub',            category: 'SaaS',       match: ['github'],                        emoji: '🐙', typical: 350 },
  { name: 'Slack',             category: 'SaaS',       match: ['slack'],                         emoji: '💬', typical: 650 },
  { name: 'Zoom',              category: 'SaaS',       match: ['zoom'],                          emoji: '📹', typical: 1300 },
  { name: 'LinkedIn Premium',  category: 'SaaS',       match: ['linkedin premium', 'linkedin'],  emoji: '💼', typical: 1700 },

  // AI
  { name: 'ChatGPT Plus',      category: 'AI',         match: ['chatgpt', 'openai'],             emoji: '🤖', typical: 1700, cancelUrl: 'https://chat.openai.com/#settings/Subscription' },
  { name: 'Claude Pro',        category: 'AI',         match: ['claude', 'anthropic'],           emoji: '🧠', typical: 1700 },
  { name: 'Perplexity Pro',    category: 'AI',         match: ['perplexity'],                    emoji: '🔍', typical: 1700 },
  { name: 'Midjourney',        category: 'AI',         match: ['midjourney'],                    emoji: '🎭', typical: 850 },
  { name: 'GitHub Copilot',    category: 'AI',         match: ['copilot'],                       emoji: '✨', typical: 850 },

  // Telecom / Internet
  { name: 'Airtel',            category: 'Telecom',    match: ['airtel'],                        emoji: '📶', typical: 399 },
  { name: 'Jio',               category: 'Telecom',    match: ['jio recharge', 'reliance jio', 'jio prepaid', 'jio postpaid'], emoji: '📡', typical: 299 },
  { name: 'Vi (Vodafone Idea)',category: 'Telecom',    match: ['vi ', 'vodafone', 'vodafone idea'], emoji: '📱', typical: 299 },
  { name: 'ACT Fibernet',      category: 'Telecom',    match: ['act fibernet', 'act broadband'], emoji: '🌐', typical: 999 },
  { name: 'Hathway',           category: 'Telecom',    match: ['hathway'],                       emoji: '🌐', typical: 799 },

  // Fitness
  { name: 'cult.fit',          category: 'Fitness',    match: ['cult', 'cultfit', 'curefit'],    emoji: '💪', typical: 1000, cancelUrl: 'https://www.cult.fit/profile/membership' },
  { name: 'Gympik / Gym',      category: 'Fitness',    match: ['gym', 'fitness'],                emoji: '🏋️', typical: 1500 },

  // Memberships
  { name: 'Amazon Prime',      category: 'Membership', match: ['amazon prime membership', 'prime membership'], emoji: '📦', typical: 125, cancelUrl: 'https://www.amazon.in/gp/your-account/manageyourprime' },
  { name: 'Swiggy One',        category: 'Membership', match: ['swiggy one', 'swiggy super'],    emoji: '🍔', typical: 99 },
  { name: 'Zomato Gold',       category: 'Membership', match: ['zomato gold', 'zomato pro'],     emoji: '🍽️', typical: 200 },
  { name: 'Flipkart Plus',     category: 'Membership', match: ['flipkart plus'],                 emoji: '🛍️', typical: 99 },

  // News
  { name: 'The Ken',           category: 'News',       match: ['the ken'],                       emoji: '📰', typical: 250 },
  { name: 'NYTimes',           category: 'News',       match: ['nytimes', 'new york times'],     emoji: '🗞️', typical: 400 },

  // Gaming
  { name: 'PlayStation Plus',  category: 'Gaming',     match: ['playstation', 'psn'],            emoji: '🎮', typical: 499 },
  { name: 'Xbox Game Pass',    category: 'Gaming',     match: ['xbox', 'game pass'],             emoji: '🕹️', typical: 489 },
  { name: 'Steam',             category: 'Gaming',     match: ['steam'],                         emoji: '🎯', typical: 0 },
];

export const POPULAR_CATEGORIES: { key: PopularCategory; label: string; emoji: string }[] = [
  { key: 'OTT',        label: 'OTT & Video',  emoji: '🎬' },
  { key: 'Music',      label: 'Music',        emoji: '🎵' },
  { key: 'AI',         label: 'AI Tools',     emoji: '🤖' },
  { key: 'SaaS',       label: 'Productivity', emoji: '🛠️' },
  { key: 'Cloud',      label: 'Cloud & Drive',emoji: '☁️' },
  { key: 'Telecom',    label: 'Telecom & Net',emoji: '📶' },
  { key: 'Membership', label: 'Memberships',  emoji: '👑' },
  { key: 'Fitness',    label: 'Fitness',      emoji: '💪' },
  { key: 'Gaming',     label: 'Gaming',       emoji: '🎮' },
  { key: 'News',       label: 'News',         emoji: '📰' },
];

/** Match a service against a merchant/title string (case-insensitive). */
export function matchService(text: string): PopularService | null {
  const t = (text || '').toLowerCase();
  if (!t) return null;
  for (const svc of POPULAR_SERVICES) {
    if (svc.match.some(m => t.includes(m))) return svc;
  }
  return null;
}
