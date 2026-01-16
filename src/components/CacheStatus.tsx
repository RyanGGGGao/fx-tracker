import React, { useEffect, useState } from 'react';
import { getAllCachedPairs, getCacheInfo } from '../services/cacheManager';
import { FETCH_CURRENCIES, BASE_CURRENCY } from '../types';

interface CacheStatusProps {
  onClose: () => void;
}

interface PairStatus {
  pair: string;
  hasData: boolean;
  dataCount: number;
  latestDate: string | null;
  lastUpdated: string | null;
}

const CacheStatus: React.FC<CacheStatusProps> = ({ onClose }) => {
  const [loading, setLoading] = useState(true);
  const [pairStatuses, setPairStatuses] = useState<PairStatus[]>([]);
  const [cacheInfo, setCacheInfo] = useState<{
    pairs: number;
    lastBatchUpdate: string | null;
    isUpdatedToday: boolean;
  } | null>(null);

  useEffect(() => {
    const checkCache = async () => {
      try {
        // Get overall cache info
        const info = await getCacheInfo();
        setCacheInfo({
          pairs: info.pairs,
          lastBatchUpdate: info.lastBatchUpdate,
          isUpdatedToday: info.isUpdatedToday,
        });

        // Get all cached pairs
        const allCached = await getAllCachedPairs();
        const cachedMap = new Map(
          allCached.map((c) => [
            `${c.pair.from}/${c.pair.to}`,
            c,
          ])
        );

        // Check each base pair (X/USD)
        const statuses: PairStatus[] = FETCH_CURRENCIES.map((currency) => {
          const pairKey = `${currency}/${BASE_CURRENCY}`;
          const cached = cachedMap.get(pairKey);
          
          if (cached && cached.rates.length > 0) {
            const sortedRates = [...cached.rates].sort((a, b) => 
              b.date.localeCompare(a.date)
            );
            const latestDate = sortedRates[0]?.date || null;
            
            return {
              pair: pairKey,
              hasData: true,
              dataCount: cached.rates.length,
              latestDate,
              lastUpdated: cached.lastUpdated 
                ? new Date(cached.lastUpdated).toLocaleString('zh-CN')
                : null,
            };
          }
          
          return {
            pair: pairKey,
            hasData: false,
            dataCount: 0,
            latestDate: null,
            lastUpdated: null,
          };
        });

        setPairStatuses(statuses);
      } catch (error) {
        console.error('检查缓存失败:', error);
      } finally {
        setLoading(false);
      }
    };

    checkCache();
  }, []);

  const today = new Date().toISOString().split('T')[0];

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
          <div className="flex items-center justify-center gap-2">
            <div className="w-6 h-6 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            <span>检查缓存状态...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">📊 缓存状态检查</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Overall status */}
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-2">整体状态</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>今日日期:</div>
            <div className="font-mono">{today}</div>
            <div>已缓存货币对数:</div>
            <div className="font-mono">{cacheInfo?.pairs || 0} / {FETCH_CURRENCIES.length}</div>
            <div>上次批量更新:</div>
            <div className="font-mono">{cacheInfo?.lastBatchUpdate || '从未'}</div>
            <div>今日是否已更新:</div>
            <div>
              {cacheInfo?.isUpdatedToday ? (
                <span className="text-green-600 font-semibold">✅ 是</span>
              ) : (
                <span className="text-orange-600 font-semibold">❌ 否</span>
              )}
            </div>
          </div>
        </div>

        {/* Per-pair status */}
        <h3 className="font-semibold mb-2">各货币对状态 (基准: USD)</h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 text-left border">货币对</th>
              <th className="p-2 text-left border">状态</th>
              <th className="p-2 text-left border">数据条数</th>
              <th className="p-2 text-left border">最新数据日期</th>
              <th className="p-2 text-left border">缓存更新时间</th>
            </tr>
          </thead>
          <tbody>
            {pairStatuses.map((status) => {
              const needsUpdate = !status.hasData || 
                (status.latestDate && status.latestDate < today);
              
              return (
                <tr key={status.pair} className={needsUpdate ? 'bg-yellow-50' : 'bg-green-50'}>
                  <td className="p-2 border font-mono">{status.pair}</td>
                  <td className="p-2 border">
                    {status.hasData ? (
                      <span className="text-green-600">✅ 有缓存</span>
                    ) : (
                      <span className="text-red-600">❌ 无缓存</span>
                    )}
                  </td>
                  <td className="p-2 border font-mono">{status.dataCount}</td>
                  <td className="p-2 border font-mono">
                    {status.latestDate || '-'}
                    {status.latestDate && status.latestDate < today && (
                      <span className="ml-2 text-orange-500 text-xs">(需更新)</span>
                    )}
                  </td>
                  <td className="p-2 border text-xs">{status.lastUpdated || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-4 p-3 bg-blue-50 rounded text-sm text-blue-800">
          <strong>说明:</strong> 
          <ul className="list-disc ml-4 mt-1">
            <li>绿色行 = 数据最新，无需更新</li>
            <li>黄色行 = 需要更新（无缓存或数据不是最新）</li>
            <li>点击右上角"刷新数据"按钮可批量更新所有货币对</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CacheStatus;
