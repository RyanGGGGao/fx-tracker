import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { CurrencyData, CurrencyCode, DailyRate } from '../types';

interface FXDatabase extends DBSchema {
  currencyData: {
    key: string;
    value: CurrencyData;
    indexes: { 'by-updated': number };
  };
  metadata: {
    key: string;
    value: {
      key: string;
      value: string | number | boolean;
    };
  };
}

const DB_NAME = 'fx-tracker-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<FXDatabase>> | null = null;

function getDB(): Promise<IDBPDatabase<FXDatabase>> {
  if (!dbPromise) {
    dbPromise = openDB<FXDatabase>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Currency data store
        const currencyStore = db.createObjectStore('currencyData', {
          keyPath: 'pair',
        });
        currencyStore.createIndex('by-updated', 'lastUpdated');

        // Metadata store
        db.createObjectStore('metadata', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

// Generate cache key for currency pair
function getPairKey(from: CurrencyCode, to: CurrencyCode): string {
  return `${from}/${to}`;
}

// Get today's date string (YYYY-MM-DD)
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Save currency data to cache
export async function saveCurrencyData(
  from: CurrencyCode,
  to: CurrencyCode,
  rates: DailyRate[]
): Promise<void> {
  const db = await getDB();
  const data: CurrencyData = {
    pair: { from, to },
    rates,
    lastUpdated: Date.now(),
  };
  await db.put('currencyData', { ...data, pair: getPairKey(from, to) } as any);
}

// Get currency data from cache
export async function getCurrencyData(
  from: CurrencyCode,
  to: CurrencyCode
): Promise<CurrencyData | null> {
  const db = await getDB();
  const key = getPairKey(from, to);
  const data = await db.get('currencyData', key);
  if (data) {
    return {
      pair: { from, to },
      rates: data.rates,
      lastUpdated: data.lastUpdated,
    };
  }
  return null;
}

// Check if all base pairs were updated today
export async function areAllBasePairsUpdatedToday(): Promise<boolean> {
  const lastUpdateDate = await getMetadata<string>('lastBatchUpdateDate');
  return lastUpdateDate === getTodayDate();
}

// Mark that all base pairs were updated today
export async function markBatchUpdateComplete(): Promise<void> {
  await saveMetadata('lastBatchUpdateDate', getTodayDate());
}

// Get last batch update date
export async function getLastBatchUpdateDate(): Promise<string | null> {
  return await getMetadata<string>('lastBatchUpdateDate');
}

// Check if cache has data (regardless of date)
export async function hasCachedData(
  from: CurrencyCode,
  to: CurrencyCode
): Promise<boolean> {
  const data = await getCurrencyData(from, to);
  return data !== null && data.rates.length > 0;
}

// Get all cached currency pairs
export async function getAllCachedPairs(): Promise<CurrencyData[]> {
  const db = await getDB();
  const all = await db.getAll('currencyData');
  return all.map((item) => {
    const pairKey = item.pair as unknown as string;
    const [from, to] = pairKey.split('/');
    return {
      pair: {
        from: from as CurrencyCode,
        to: to as CurrencyCode,
      },
      rates: item.rates,
      lastUpdated: item.lastUpdated,
    };
  });
}

// Save metadata
export async function saveMetadata(key: string, value: string | number | boolean): Promise<void> {
  const db = await getDB();
  await db.put('metadata', { key, value });
}

// Get metadata
export async function getMetadata<T extends string | number | boolean>(key: string): Promise<T | null> {
  const db = await getDB();
  const data = await db.get('metadata', key);
  return data ? (data.value as T) : null;
}

// Clear all cache
export async function clearCache(): Promise<void> {
  const db = await getDB();
  await db.clear('currencyData');
  await db.clear('metadata');
}

// Get cache size info
export async function getCacheInfo(): Promise<{ 
  pairs: number; 
  oldestUpdate: number | null;
  lastBatchUpdate: string | null;
  isUpdatedToday: boolean;
}> {
  const db = await getDB();
  const all = await db.getAll('currencyData');
  const lastBatchUpdate = await getMetadata<string>('lastBatchUpdateDate');
  const isUpdatedToday = await areAllBasePairsUpdatedToday();
  
  if (all.length === 0) {
    return { pairs: 0, oldestUpdate: null, lastBatchUpdate, isUpdatedToday };
  }
  const oldestUpdate = Math.min(...all.map((d) => d.lastUpdated));
  return { pairs: all.length, oldestUpdate, lastBatchUpdate, isUpdatedToday };
}
