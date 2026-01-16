import { CurrencyCode, DailyRate, FETCH_CURRENCIES, BASE_CURRENCY } from '../types';
import { 
  saveCurrencyData, 
  getCurrencyData, 
  areAllBasePairsUpdatedToday, 
  markBatchUpdateComplete,
  hasCachedData 
} from './cacheManager';
import { canMakeApiCall, recordApiCall, getTimeUntilNextCall } from './rateLimiter';

// Alpha Vantage API configuration
// Note: In production, consider using environment variables
const API_KEY = 'ATGWDM9JZW2BPH38'; // Replace with your free API key from https://www.alphavantage.co/support/#api-key
const API_BASE = 'https://www.alphavantage.co/query';

interface AlphaVantageResponse {
  'Meta Data'?: {
    '1. Information': string;
    '2. From Symbol': string;
    '3. To Symbol': string;
    '4. Output Size': string;
    '5. Last Refreshed': string;
  };
  'Time Series FX (Daily)'?: {
    [date: string]: {
      '1. open': string;
      '2. high': string;
      '3. low': string;
      '4. close': string;
    };
  };
  Note?: string;
  'Error Message'?: string;
}

// Parse Alpha Vantage response to DailyRate array
function parseRates(data: AlphaVantageResponse): DailyRate[] {
  const timeSeries = data['Time Series FX (Daily)'];
  if (!timeSeries) return [];

  return Object.entries(timeSeries)
    .map(([date, values]) => ({
      date,
      open: parseFloat(values['1. open']),
      high: parseFloat(values['2. high']),
      low: parseFloat(values['3. low']),
      close: parseFloat(values['4. close']),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Fetch currency pair data from API
async function fetchFromApi(
  from: CurrencyCode,
  to: CurrencyCode
): Promise<DailyRate[]> {
  if (!canMakeApiCall()) {
    throw new Error('已达到今日API调用限制，请明天再试');
  }

  // Wait if needed (rate limit per minute)
  const waitTime = getTimeUntilNextCall();
  if (waitTime > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  const url = new URL(API_BASE);
  url.searchParams.set('function', 'FX_DAILY');
  url.searchParams.set('from_symbol', from);
  url.searchParams.set('to_symbol', to);
  url.searchParams.set('outputsize', 'full'); // Get full history (20+ years)
  url.searchParams.set('apikey', API_KEY);

  const response = await fetch(url.toString());
  recordApiCall();

  if (!response.ok) {
    throw new Error(`API请求失败: ${response.status}`);
  }

  const data: AlphaVantageResponse = await response.json();

  if (data.Note) {
    throw new Error('API调用频率超限，请稍后再试');
  }

  if (data['Error Message']) {
    throw new Error(`API错误: ${data['Error Message']}`);
  }

  return parseRates(data);
}

// Get currency data (from cache or API)
// Strategy: ALWAYS use cache if available, only call API when:
// 1. No cache exists at all, OR
// 2. User manually clicks refresh button (forceRefresh = true)
export async function getCurrencyPairData(
  from: CurrencyCode,
  to: CurrencyCode,
  forceRefresh: boolean = false
): Promise<DailyRate[]> {
  // Handle same currency - return empty to show "please select different currencies"
  if (from === to) {
    return [];
  }

  // Case 1: from=USD, to=X (need to invert X/USD rate)
  if (from === BASE_CURRENCY && to !== BASE_CURRENCY) {
    const directRate = await getCurrencyPairData(to, BASE_CURRENCY, forceRefresh);
    if (directRate.length === 0) {
      return [];
    }
    // Invert the rate: USD/EUR = 1 / (EUR/USD)
    return directRate.map(rate => ({
      date: rate.date,
      open: 1 / rate.open,
      high: 1 / rate.low,  // Inverted: high becomes 1/low
      low: 1 / rate.high,  // Inverted: low becomes 1/high
      close: 1 / rate.close,
    }));
  }

  // Case 2: Both are non-USD, calculate cross rate from cached USD pairs
  if (from !== BASE_CURRENCY && to !== BASE_CURRENCY) {
    const [fromToUsd, toToUsd] = await Promise.all([
      getCurrencyPairData(from, BASE_CURRENCY, forceRefresh),
      getCurrencyPairData(to, BASE_CURRENCY, forceRefresh),
    ]);
    if (fromToUsd.length === 0 || toToUsd.length === 0) {
      return [];
    }
    return calculateCrossRate(fromToUsd, toToUsd);
  }

  // Case 3: from=X, to=USD (direct cache lookup)

  // ALWAYS check cache first (regardless of date)
  const cached = await getCurrencyData(from, to);
  
  // If we have cached data and not forcing refresh, return it
  if (cached && cached.rates.length > 0 && !forceRefresh) {
    return cached.rates;
  }

  // Only fetch from API if:
  // 1. forceRefresh is true (user clicked refresh), OR
  // 2. No cached data exists at all
  if (forceRefresh || !cached || cached.rates.length === 0) {
    try {
      const rates = await fetchFromApi(from, to);
      await saveCurrencyData(from, to, rates);
      return rates;
    } catch (error) {
      // If API fails but we have stale cache, use it
      if (cached && cached.rates.length > 0) {
        console.warn('API请求失败，使用缓存数据');
        return cached.rates;
      }
      throw error;
    }
  }

  // Fallback to empty (shouldn't reach here)
  return [];
}

// Calculate cross rate from two USD pairs
function calculateCrossRate(fromToUsd: DailyRate[], toToUsd: DailyRate[]): DailyRate[] {
  // Create map for quick lookup
  const toUsdMap = new Map<string, DailyRate>();
  toToUsd.forEach((rate) => toUsdMap.set(rate.date, rate));

  // Calculate cross rate: FROM/TO = (FROM/USD) / (TO/USD)
  return fromToUsd
    .filter((fromRate) => toUsdMap.has(fromRate.date))
    .map((fromRate) => {
      const toRate = toUsdMap.get(fromRate.date)!;
      return {
        date: fromRate.date,
        open: fromRate.open / toRate.open,
        high: fromRate.high / toRate.low, // Max ratio
        low: fromRate.low / toRate.high, // Min ratio
        close: fromRate.close / toRate.close,
      };
    });
}

// Prefetch all base currency pairs (for initial load or daily update)
// This is the ONLY place that should call API automatically
export async function prefetchBasePairs(
  onProgress?: (current: number, total: number, currency: string) => void,
  forceRefresh: boolean = false
): Promise<{ success: number; failed: number }> {
  // Check if already updated today (unless force refresh)
  if (!forceRefresh) {
    const alreadyUpdated = await areAllBasePairsUpdatedToday();
    if (alreadyUpdated) {
      console.log('今日已更新，使用缓存数据');
      return { success: FETCH_CURRENCIES.length, failed: 0 };
    }
  }

  const total = FETCH_CURRENCIES.length;
  let current = 0;
  let success = 0;
  let failed = 0;

  for (const currency of FETCH_CURRENCIES) {
    try {
      // Always fetch from API during batch update
      const rates = await fetchFromApi(currency, BASE_CURRENCY);
      await saveCurrencyData(currency, BASE_CURRENCY, rates);
      success++;
      current++;
      onProgress?.(current, total, currency);
    } catch (error) {
      console.error(`预加载 ${currency}/USD 失败:`, error);
      failed++;
      current++;
      onProgress?.(current, total, currency);
    }
  }

  // Mark batch update complete if all succeeded
  if (failed === 0) {
    await markBatchUpdateComplete();
  }

  return { success, failed };
}

// Check if initial data load is needed
export async function needsInitialLoad(): Promise<boolean> {
  // Check if we have any cached data
  for (const currency of FETCH_CURRENCIES) {
    const hasData = await hasCachedData(currency, BASE_CURRENCY);
    if (!hasData) {
      return true;
    }
  }
  return false;
}

// Check if daily update is needed
export async function needsDailyUpdate(): Promise<boolean> {
  return !(await areAllBasePairsUpdatedToday());
}

// Get real-time exchange rate
export async function getRealtimeRate(
  from: CurrencyCode,
  to: CurrencyCode
): Promise<number | null> {
  try {
    const rates = await getCurrencyPairData(from, to);
    if (rates.length > 0) {
      return rates[rates.length - 1].close;
    }
  } catch {
    // Return null if failed
  }
  return null;
}

// Filter rates by date range
export function filterRatesByDateRange(
  rates: DailyRate[],
  startDate: string,
  endDate: string
): DailyRate[] {
  return rates.filter((rate) => rate.date >= startDate && rate.date <= endDate);
}

// Calculate percentage change series
export function calculatePercentageChange(rates: DailyRate[]): { date: string; value: number }[] {
  if (rates.length === 0) return [];
  
  const baseValue = rates[0].close;
  return rates.map((rate) => ({
    date: rate.date,
    value: ((rate.close - baseValue) / baseValue) * 100,
  }));
}
