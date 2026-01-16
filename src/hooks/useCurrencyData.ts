import { useState, useEffect, useCallback, useMemo } from 'react';
import { DailyRate, CurrencyCode } from '../types';
import { getCurrencyPairData, filterRatesByDateRange, calculatePercentageChange } from '../services/currencyApi';
import { getRateLimitStatus, RateLimitStatus } from '../services/rateLimiter';
import dayjs from 'dayjs';

export interface UseCurrencyDataOptions {
  from: CurrencyCode;
  to: CurrencyCode;
  startDate?: string;
  endDate?: string;
  enabled?: boolean; // New: control whether to fetch data
}

export interface UseCurrencyDataResult {
  data: DailyRate[];
  percentageData: { date: string; value: number }[];
  loading: boolean;
  error: string | null;
  isSameCurrency: boolean; // New: indicate same currency selected
  refresh: () => Promise<void>;
  rateLimitStatus: RateLimitStatus;
}

export function useCurrencyData(options: UseCurrencyDataOptions): UseCurrencyDataResult {
  const {
    from,
    to,
    startDate = dayjs().subtract(1, 'year').format('YYYY-MM-DD'),
    endDate = dayjs().format('YYYY-MM-DD'),
    enabled = true,
  } = options;

  const [data, setData] = useState<DailyRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus>(getRateLimitStatus());

  const isSameCurrency = from === to;

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled || isSameCurrency) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setRateLimitStatus(getRateLimitStatus());

    try {
      const rates = await getCurrencyPairData(from, to, forceRefresh);
      const filteredRates = filterRatesByDateRange(rates, startDate, endDate);
      setData(filteredRates);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
    } finally {
      setLoading(false);
      setRateLimitStatus(getRateLimitStatus());
    }
  }, [from, to, startDate, endDate, enabled, isSameCurrency]);

  // Initial fetch
  useEffect(() => {
    if (enabled && !isSameCurrency) {
      fetchData();
    }
  }, [fetchData, enabled, isSameCurrency]);

  // 移除定时器更新 rateLimitStatus，避免不必要的重新渲染
  // StatusBar 组件有自己的定时器来显示状态

  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  const percentageData = calculatePercentageChange(data);

  return {
    data,
    percentageData,
    loading,
    error,
    isSameCurrency,
    refresh,
    rateLimitStatus,
  };
}

// Hook for comparing two currencies
export interface UseComparisonDataResult {
  data1: DailyRate[];
  data2: DailyRate[];
  percentageData1: { date: string; value: number }[];
  percentageData2: { date: string; value: number }[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useComparisonData(
  currency1: CurrencyCode,
  currency2: CurrencyCode,
  baseCurrency: CurrencyCode,
  startDate: string,
  endDate: string,
  enabled: boolean = true
): UseComparisonDataResult {
  const [data1, setData1] = useState<DailyRate[]>([]);
  const [data2, setData2] = useState<DailyRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [rates1, rates2] = await Promise.all([
        getCurrencyPairData(currency1, baseCurrency, forceRefresh),
        getCurrencyPairData(currency2, baseCurrency, forceRefresh),
      ]);

      setData1(filterRatesByDateRange(rates1, startDate, endDate));
      setData2(filterRatesByDateRange(rates2, startDate, endDate));
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [currency1, currency2, baseCurrency, startDate, endDate, enabled]);

  useEffect(() => {
    if (enabled) {
      fetchData();
    }
  }, [fetchData, enabled]);

  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  return {
    data1,
    data2,
    percentageData1: calculatePercentageChange(data1),
    percentageData2: calculatePercentageChange(data2),
    loading,
    error,
    refresh,
  };
}

// Hook for comparing multiple currencies
export interface UseMultiComparisonDataResult {
  currencyDataList: {
    currency: CurrencyCode;
    data: DailyRate[];
    percentageData: { date: string; value: number }[];
  }[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMultiComparisonData(
  currencies: CurrencyCode[],
  baseCurrency: CurrencyCode,
  startDate: string,
  endDate: string,
  enabled: boolean = true
): UseMultiComparisonDataResult {
  const [dataMap, setDataMap] = useState<Map<CurrencyCode, DailyRate[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter out base currency from comparison (comparing X/USD, USD/USD makes no sense)
  // 使用 useMemo 稳定 validCurrencies
  const validCurrencies = useMemo(() => 
    currencies.filter(c => c !== baseCurrency),
    [currencies, baseCurrency]
  );
  
  // 稳定化货币列表的字符串表示，用于依赖项比较
  const currenciesKey = validCurrencies.join(',');

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled || validCurrencies.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await Promise.all(
        validCurrencies.map(currency => 
          getCurrencyPairData(currency, baseCurrency, forceRefresh)
        )
      );

      const newDataMap = new Map<CurrencyCode, DailyRate[]>();
      validCurrencies.forEach((currency, index) => {
        newDataMap.set(currency, filterRatesByDateRange(results[index], startDate, endDate));
      });
      setDataMap(newDataMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [currenciesKey, baseCurrency, startDate, endDate, enabled, validCurrencies]);

  useEffect(() => {
    if (enabled && validCurrencies.length > 0) {
      fetchData();
    }
  }, [fetchData, enabled, validCurrencies.length]);

  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  // 使用 useMemo 稳定 currencyDataList，避免不必要的重新渲染
  const currencyDataList = useMemo(() => {
    return validCurrencies.map(currency => {
      const data = dataMap.get(currency) || [];
      return {
        currency,
        data,
        percentageData: calculatePercentageChange(data),
      };
    });
  }, [validCurrencies, dataMap]);

  return {
    currencyDataList,
    loading,
    error,
    refresh,
  };
}
