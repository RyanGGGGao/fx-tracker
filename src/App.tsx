import React, { useState, useCallback, useEffect } from 'react';
import dayjs from 'dayjs';
import { CurrencyCode, ViewMode, BASE_CURRENCY, FETCH_CURRENCIES, ChartType } from './types';
import { CurrencyPairSelector, MultiCurrencySelector } from './components/CurrencySelector';
import DateRangePicker from './components/DateRangePicker';
import CurrencyChart from './components/CurrencyChart';
import MultiComparisonChart from './components/MultiComparisonChart';
import StatusBar from './components/StatusBar';
import CacheStatus from './components/CacheStatus';
import { useCurrencyData, useMultiComparisonData } from './hooks/useCurrencyData';
import { prefetchBasePairs, needsInitialLoad } from './services/currencyApi';

const App: React.FC = () => {
  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('single');

  // Chart type for single view
  const [chartType, setChartType] = useState<ChartType>('line');

  // Show events on chart
  const [showEvents, setShowEvents] = useState(true);

  // Single currency pair selection
  const [fromCurrency, setFromCurrency] = useState<CurrencyCode>('EUR');
  const [toCurrency, setToCurrency] = useState<CurrencyCode>('USD');

  // Multi-currency comparison selection
  const [comparisonCurrencies, setComparisonCurrencies] = useState<CurrencyCode[]>(['EUR', 'GBP', 'JPY']);
  const [baseCurrency] = useState<CurrencyCode>(BASE_CURRENCY);

  // Date range - 默认显示过去3年，以便看到更多历史事件
  const [startDate, setStartDate] = useState(
    dayjs().subtract(3, 'year').format('YYYY-MM-DD')
  );
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));

  // Loading state for initial data fetch
  const [isInitializing, setIsInitializing] = useState(true);
  const [initProgress, setInitProgress] = useState({ current: 0, total: FETCH_CURRENCIES.length, currency: '' });
  const [initError, setInitError] = useState<string | null>(null);

  // Cache status dialog
  const [showCacheStatus, setShowCacheStatus] = useState(false);

  // Single currency view data
  const singleCurrencyData = useCurrencyData({
    from: fromCurrency,
    to: toCurrency,
    startDate,
    endDate,
    enabled: !isInitializing,
  });

  // Multi-currency comparison view data
  const multiComparisonData = useMultiComparisonData(
    comparisonCurrencies,
    baseCurrency,
    startDate,
    endDate,
    !isInitializing
  );

  // Last updated timestamp
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initialize data on first load - NO automatic API calls
  // API is ONLY called when user manually clicks refresh
  useEffect(() => {
    const initializeData = async () => {
      try {
        const needsInit = await needsInitialLoad();
        
        if (needsInit) {
          console.log('首次使用，无缓存数据。请点击刷新按钮获取数据。');
          // Don't call API automatically - just show empty state
          // User must click refresh button to fetch data
        } else {
          console.log('使用缓存数据');
        }
        
        setIsInitializing(false);
        setLastUpdated(Date.now());
      } catch (error) {
        console.error('初始化失败:', error);
        setInitError(error instanceof Error ? error.message : '初始化失败');
        setIsInitializing(false);
      }
    };

    initializeData();
  }, []);

  // Handle manual refresh - refreshes ALL currencies
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await prefetchBasePairs((current, total, currency) => {
        setInitProgress({ current, total, currency });
      }, true); // Force refresh
      
      // Trigger re-fetch in current view
      switch (viewMode) {
        case 'single':
          await singleCurrencyData.refresh();
          break;
        case 'compare':
          await multiComparisonData.refresh();
          break;
      }
      setLastUpdated(Date.now());
    } catch (error) {
      console.error('刷新失败:', error);
    } finally {
      setIsRefreshing(false);
    }
  // 只依赖 refresh 函数，避免整个对象变化导致重新创建
  }, [viewMode, singleCurrencyData.refresh, multiComparisonData.refresh]);

  // Swap currencies
  const handleSwap = useCallback(() => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  }, [fromCurrency, toCurrency]);

  // No auto-refresh - only manual refresh to save API calls

  // Show initialization screen
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-primary-600 rounded-xl flex items-center justify-center">
              <span className="text-2xl font-bold text-white">FX</span>
            </div>
          </div>
          <h2 className="text-xl font-bold text-center text-gray-800 mb-2">
            正在初始化数据
          </h2>
          <p className="text-gray-500 text-center mb-6">
            首次加载需要获取所有货币数据，请稍候...
          </p>
          
          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>加载进度</span>
              <span>{initProgress.current}/{initProgress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(initProgress.current / initProgress.total) * 100}%` }}
              />
            </div>
            {initProgress.currency && (
              <p className="text-sm text-gray-500 mt-2 text-center">
                正在获取 {initProgress.currency}/USD...
              </p>
            )}
          </div>

          {initError && (
            <div className="bg-red-50 text-red-600 rounded-lg p-3 text-sm">
              {initError}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <span className="text-xl font-bold">FX</span>
              </div>
              <div>
                <h1 className="text-xl font-bold">FX Tracker</h1>
                <p className="text-sm text-primary-100">外汇货币走势追踪</p>
              </div>
            </div>
            <div className="text-sm text-primary-100">
              支持 10 年历史数据 | 离线可用
            </div>
          </div>
        </div>
      </header>

      {/* Status bar */}
      <StatusBar
        lastUpdated={lastUpdated}
        onRefresh={handleRefresh}
        refreshing={isRefreshing}
        onCheckCache={() => setShowCacheStatus(true)}
      />

      {/* Cache status dialog */}
      {showCacheStatus && (
        <CacheStatus onClose={() => setShowCacheStatus(false)} />
      )}

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {/* View mode tabs */}
        <div className="mb-6">
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-fit">
            <button
              onClick={() => setViewMode('single')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'single'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              📈 汇率走势
            </button>
            <button
              onClick={() => setViewMode('compare')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'compare'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              📊 货币对比
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 mb-6">
          <div className="flex flex-wrap gap-6 items-start">
            {/* Currency selection based on view mode */}
            {viewMode === 'single' && (
              <div className="flex flex-col gap-4 w-full">
                {/* Currency pair selector and chart type toggle */}
                <div className="flex items-end gap-4 flex-wrap">
                  <CurrencyPairSelector
                    from={fromCurrency}
                    to={toCurrency}
                    onFromChange={setFromCurrency}
                    onToChange={setToCurrency}
                    onSwap={handleSwap}
                  />
                  
                  {/* Chart type toggle */}
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-600">图表类型</label>
                    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                      <button
                        onClick={() => setChartType('line')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          chartType === 'line'
                            ? 'bg-white text-primary-700 shadow-sm'
                            : 'text-gray-600 hover:text-gray-800'
                        }`}
                      >
                        📈 折线图
                      </button>
                      <button
                        onClick={() => setChartType('candlestick')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          chartType === 'candlestick'
                            ? 'bg-white text-primary-700 shadow-sm'
                            : 'text-gray-600 hover:text-gray-800'
                        }`}
                      >
                        🕯️ K线图
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'compare' && (
              <div className="w-full">
                <MultiCurrencySelector
                  selected={comparisonCurrencies}
                  onChange={setComparisonCurrencies}
                  excludeCurrency={baseCurrency}
                />
              </div>
            )}
          </div>

          {/* Date range picker */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
            />
          </div>
        </div>

        {/* Chart */}
        <div className="mb-6">
          {viewMode === 'single' && (
            <CurrencyChart
              data={singleCurrencyData.data}
              from={fromCurrency}
              to={toCurrency}
              chartType={chartType}
              loading={singleCurrencyData.loading}
              error={singleCurrencyData.error}
              isSameCurrency={singleCurrencyData.isSameCurrency}
              height={450}
              showEvents={showEvents}
              onToggleEvents={setShowEvents}
            />
          )}

          {viewMode === 'compare' && (
            <MultiComparisonChart
              currencyDataList={multiComparisonData.currencyDataList}
              loading={multiComparisonData.loading}
              error={multiComparisonData.error}
              height={450}
            />
          )}
        </div>

        {/* Info card */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-blue-500 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <div className="font-semibold mb-1">使用说明</div>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>数据来源：Alpha Vantage（每日更新）</li>
                <li>支持最多 10 年历史数据查询</li>
                <li>首次使用请点击<strong>"手动刷新"</strong>获取数据</li>
                <li>点击"手动刷新"可强制更新所有货币（消耗8次API调用）</li>
                <li>数据缓存在浏览器本地，支持离线查看</li>
                <li>图表支持缩放和平移，可拖拽查看详情</li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm">
          <p>FX Tracker - 外汇货币走势追踪 | 数据仅供参考，不构成投资建议</p>
          <p className="mt-1">
            Powered by{' '}
            <a
              href="https://www.alphavantage.co/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-400 hover:text-primary-300"
            >
              Alpha Vantage
            </a>
            {' | '}
            Deployed on{' '}
            <a
              href="https://vercel.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-400 hover:text-primary-300"
            >
              Vercel
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
