const STORAGE_KEY = 'fx-api-rate-limit';
const SAFE_LIMIT = 24; // Leave 1 call buffer (daily limit is 25)

interface RateLimitData {
  date: string;
  calls: number;
  lastCall: number;
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function loadData(): RateLimitData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as RateLimitData;
      // Reset if it's a new day
      if (data.date !== getTodayDate()) {
        return { date: getTodayDate(), calls: 0, lastCall: 0 };
      }
      return data;
    }
  } catch {
    // Ignore parse errors
  }
  return { date: getTodayDate(), calls: 0, lastCall: 0 };
}

function saveData(data: RateLimitData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Check if we can make an API call
export function canMakeApiCall(): boolean {
  const data = loadData();
  return data.calls < SAFE_LIMIT;
}

// Record an API call
export function recordApiCall(): void {
  const data = loadData();
  data.calls += 1;
  data.lastCall = Date.now();
  saveData(data);
}

// Get remaining calls for today
export function getRemainingCalls(): number {
  const data = loadData();
  return Math.max(0, SAFE_LIMIT - data.calls);
}

// Get calls made today
export function getCallsToday(): number {
  const data = loadData();
  return data.calls;
}

// Get last call timestamp
export function getLastCallTime(): number {
  const data = loadData();
  return data.lastCall;
}

// Check if enough time has passed since last call (rate limit per minute)
export function canCallNow(minIntervalMs: number = 12000): boolean {
  // Alpha Vantage free tier: 5 calls per minute = 12 seconds between calls
  const data = loadData();
  return Date.now() - data.lastCall >= minIntervalMs;
}

// Get time until next call is allowed
export function getTimeUntilNextCall(minIntervalMs: number = 12000): number {
  const data = loadData();
  const elapsed = Date.now() - data.lastCall;
  return Math.max(0, minIntervalMs - elapsed);
}

// Reset daily counter (for testing)
export function resetDailyCounter(): void {
  saveData({ date: getTodayDate(), calls: 0, lastCall: 0 });
}

// Get full status
export interface RateLimitStatus {
  callsToday: number;
  remainingCalls: number;
  canCall: boolean;
  lastCallTime: number;
  nextCallIn: number;
}

export function getRateLimitStatus(): RateLimitStatus {
  const data = loadData();
  const canCall = data.calls < SAFE_LIMIT;
  const minInterval = 12000;
  const nextCallIn = Math.max(0, minInterval - (Date.now() - data.lastCall));
  
  return {
    callsToday: data.calls,
    remainingCalls: Math.max(0, SAFE_LIMIT - data.calls),
    canCall: canCall && nextCallIn === 0,
    lastCallTime: data.lastCall,
    nextCallIn,
  };
}
