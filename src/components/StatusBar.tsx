import React, { useEffect, useState } from 'react';
import { getRateLimitStatus, RateLimitStatus, resetDailyCounter } from '../services/rateLimiter';
import { getCacheInfo } from '../services/cacheManager';

interface StatusBarProps {
  lastUpdated?: number;
  onRefresh?: () => void;
  refreshing?: boolean;
  onCheckCache?: () => void;
  onSyncToCloud?: () => void;
  syncing?: boolean;
}

interface CacheInfoState {
  pairs: number;
  oldestUpdate: number | null;
  lastBatchUpdate: string | null;
  isUpdatedToday: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  lastUpdated,
  onRefresh,
  refreshing = false,
  onCheckCache,
  onSyncToCloud,
  syncing = false,
}) => {
  const [status, setStatus] = useState<RateLimitStatus>(getRateLimitStatus());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [cacheInfo, setCacheInfo] = useState<CacheInfoState>({
    pairs: 0,
    oldestUpdate: null,
    lastBatchUpdate: null,
    isUpdatedToday: false,
  });

  // Update status periodically
  useEffect(() => {
    const updateStatus = () => {
      setStatus(getRateLimitStatus());
      setIsOnline(navigator.onLine);
    };

    const interval = setInterval(updateStatus, 5000); // Check every 5 seconds
    
    // Listen for online/offline events
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  // Load cache info
  useEffect(() => {
    getCacheInfo().then(setCacheInfo);
  }, [lastUpdated]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '从未';
    return dateStr;
  };

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
        {/* Online status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className={isOnline ? 'text-green-600' : 'text-red-600'}>
              {isOnline ? '在线' : '离线模式'}
            </span>
          </div>

          {/* Cache info */}
          <div className="flex items-center gap-1 text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
              />
            </svg>
            <span>缓存: {cacheInfo.pairs} 个货币对</span>
          </div>

          {/* Update status */}
          <div className={`flex items-center gap-1 ${cacheInfo.isUpdatedToday ? 'text-green-600' : 'text-amber-600'}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              {cacheInfo.isUpdatedToday 
                ? '今日已更新' 
                : `上次更新: ${formatDate(cacheInfo.lastBatchUpdate)}`}
            </span>
          </div>
        </div>

        {/* API status and refresh */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-gray-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <span>
              今日API: {status.callsToday}/24次
              {status.remainingCalls <= 5 && (
                <span className="text-amber-600 ml-1">(余量不足)</span>
              )}
            </span>
            <button
              onClick={() => {
                resetDailyCounter();
                setStatus(getRateLimitStatus());
              }}
              className="text-xs px-2 py-0.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded"
              title="重置API使用次数（换新key后使用）"
            >
              重置
            </button>
          </div>

          {onCheckCache && (
            <button
              onClick={onCheckCache}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              title="查看缓存详细状态"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
              <span>检查缓存</span>
            </button>
          )}

          {onSyncToCloud && (
            <button
              onClick={onSyncToCloud}
              disabled={syncing || !isOnline}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg transition-colors
                ${
                  syncing || !isOnline
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              title="将本地缓存数据同步到云端数据库"
            >
              <svg
                className={`w-4 h-4 ${syncing ? 'animate-pulse' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <span>{syncing ? '同步中...' : '同步到云端'}</span>
            </button>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing || !isOnline}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg transition-colors
                ${
                  refreshing || !isOnline
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                }`}
              title="手动刷新所有货币数据（会消耗8次API调用）"
            >
              <svg
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>{refreshing ? '刷新中...' : '手动刷新'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
