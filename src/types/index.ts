// Currency types
export interface CurrencyPair {
  from: string;
  to: string;
}

export interface DailyRate {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CurrencyData {
  pair: CurrencyPair;
  rates: DailyRate[];
  lastUpdated: number;
}

// Supported currencies
export const CURRENCIES = [
  { code: 'USD', name: '美元', symbol: '$', flag: '🇺🇸' },
  { code: 'EUR', name: '欧元', symbol: '€', flag: '🇪🇺' },
  { code: 'GBP', name: '英镑', symbol: '£', flag: '🇬🇧' },
  { code: 'JPY', name: '日元', symbol: '¥', flag: '🇯🇵' },
  { code: 'CNY', name: '人民币', symbol: '¥', flag: '🇨🇳' },
  { code: 'CHF', name: '瑞士法郎', symbol: 'Fr', flag: '🇨🇭' },
  { code: 'AUD', name: '澳元', symbol: 'A$', flag: '🇦🇺' },
  { code: 'CAD', name: '加元', symbol: 'C$', flag: '🇨🇦' },
  { code: 'NZD', name: '新西兰元', symbol: 'NZ$', flag: '🇳🇿' },
] as const;

export type CurrencyCode = typeof CURRENCIES[number]['code'];

// Base currency for API optimization (all pairs fetched against USD)
export const BASE_CURRENCY: CurrencyCode = 'USD';

// Non-USD currencies that need to be fetched
export const FETCH_CURRENCIES: CurrencyCode[] = ['EUR', 'GBP', 'JPY', 'CNY', 'CHF', 'AUD', 'CAD', 'NZD'];

// Time range presets
export interface TimeRange {
  label: string;
  days: number;
}

export const TIME_RANGES: TimeRange[] = [
  { label: '1周', days: 7 },
  { label: '1月', days: 30 },
  { label: '3月', days: 90 },
  { label: '6月', days: 180 },
  { label: '1年', days: 365 },
  { label: '3年', days: 365 * 3 },
  { label: '5年', days: 365 * 5 },
  { label: '10年', days: 365 * 10 },
];

// View modes
export type ViewMode = 'single' | 'compare';

// Chart types
export type ChartType = 'line' | 'candlestick';

// API status
export interface ApiStatus {
  callsToday: number;
  lastCallTime: number;
  isOnline: boolean;
}
