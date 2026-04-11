export interface CountryEntry {
  code: string;
  name: string;
  currency: string;
  currencySymbol: string;
}

export const COUNTRIES: CountryEntry[] = [
  { code: 'IN', name: 'India', currency: 'INR', currencySymbol: '₹' },
  { code: 'US', name: 'United States', currency: 'USD', currencySymbol: '$' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', currencySymbol: '£' },
  { code: 'CA', name: 'Canada', currency: 'CAD', currencySymbol: 'C$' },
  { code: 'AU', name: 'Australia', currency: 'AUD', currencySymbol: 'A$' },
  { code: 'DE', name: 'Germany', currency: 'EUR', currencySymbol: '€' },
  { code: 'FR', name: 'France', currency: 'EUR', currencySymbol: '€' },
  { code: 'IT', name: 'Italy', currency: 'EUR', currencySymbol: '€' },
  { code: 'ES', name: 'Spain', currency: 'EUR', currencySymbol: '€' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR', currencySymbol: '€' },
  { code: 'BE', name: 'Belgium', currency: 'EUR', currencySymbol: '€' },
  { code: 'AT', name: 'Austria', currency: 'EUR', currencySymbol: '€' },
  { code: 'PT', name: 'Portugal', currency: 'EUR', currencySymbol: '€' },
  { code: 'IE', name: 'Ireland', currency: 'EUR', currencySymbol: '€' },
  { code: 'FI', name: 'Finland', currency: 'EUR', currencySymbol: '€' },
  { code: 'JP', name: 'Japan', currency: 'JPY', currencySymbol: '¥' },
  { code: 'CN', name: 'China', currency: 'CNY', currencySymbol: '¥' },
  { code: 'KR', name: 'South Korea', currency: 'KRW', currencySymbol: '₩' },
  { code: 'SG', name: 'Singapore', currency: 'SGD', currencySymbol: 'S$' },
  { code: 'AE', name: 'UAE', currency: 'AED', currencySymbol: 'د.إ' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', currencySymbol: '﷼' },
  { code: 'BR', name: 'Brazil', currency: 'BRL', currencySymbol: 'R$' },
  { code: 'MX', name: 'Mexico', currency: 'MXN', currencySymbol: 'Mex$' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', currencySymbol: 'R' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', currencySymbol: '₦' },
  { code: 'SE', name: 'Sweden', currency: 'SEK', currencySymbol: 'kr' },
  { code: 'NO', name: 'Norway', currency: 'NOK', currencySymbol: 'kr' },
  { code: 'DK', name: 'Denmark', currency: 'DKK', currencySymbol: 'kr' },
  { code: 'CH', name: 'Switzerland', currency: 'CHF', currencySymbol: 'CHF' },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD', currencySymbol: 'NZ$' },
  { code: 'TH', name: 'Thailand', currency: 'THB', currencySymbol: '฿' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR', currencySymbol: 'RM' },
  { code: 'PH', name: 'Philippines', currency: 'PHP', currencySymbol: '₱' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR', currencySymbol: 'Rp' },
  { code: 'PK', name: 'Pakistan', currency: 'PKR', currencySymbol: '₨' },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT', currencySymbol: '৳' },
  { code: 'LK', name: 'Sri Lanka', currency: 'LKR', currencySymbol: 'Rs' },
  { code: 'NP', name: 'Nepal', currency: 'NPR', currencySymbol: 'Rs' },
];

export const CURRENCIES = [...new Map(COUNTRIES.map(c => [c.currency, { code: c.currency, symbol: c.currencySymbol }])).values()];

export function getCurrencyForCountry(countryCode: string): string {
  return COUNTRIES.find(c => c.code === countryCode)?.currency || 'INR';
}

export function getCurrencySymbol(currencyCode: string): string {
  return COUNTRIES.find(c => c.currency === currencyCode)?.currencySymbol || currencyCode;
}
