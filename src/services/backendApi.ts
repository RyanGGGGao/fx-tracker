// Backend API service for fetching and saving exchange rates
const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3000/api';

export interface ExchangeRateRecord {
  from_currency: string;
  to_currency: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface RatesResponse {
  success: boolean;
  data: ExchangeRateRecord[];
  count: number;
}

export interface StatusResponse {
  success: boolean;
  totalRecords: number;
  pairs: Array<{
    pair: string;
    count: number;
    latestDate: string;
    oldestDate: string;
  }>;
  serverTime: string;
}

/**
 * Fetch historical rates from backend database
 */
export async function fetchRatesFromBackend(
  from: string,
  to: string,
  startDate?: string,
  endDate?: string
): Promise<ExchangeRateRecord[]> {
  try {
    const params = new URLSearchParams({
      from,
      to,
      ...(startDate && { start_date: startDate }),
      ...(endDate && { end_date: endDate }),
    });

    const response = await fetch(`${API_BASE}/rates?${params}`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const result: RatesResponse = await response.json();
    
    if (!result.success) {
      throw new Error('Backend returned unsuccessful response');
    }

    return result.data;
  } catch (error) {
    console.error('Error fetching rates from backend:', error);
    return [];
  }
}

/**
 * Save rates to backend database
 */
export async function saveRatesToBackend(
  rates: Array<{
    from: string;
    to: string;
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
  }>
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/rates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rates }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Error saving rates to backend:', error);
    return false;
  }
}

/**
 * Get backend database status
 */
export async function getBackendStatus(): Promise<StatusResponse | null> {
  try {
    const response = await fetch(`${API_BASE}/status`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching backend status:', error);
    return null;
  }
}

/**
 * Trigger backend sync (requires authorization)
 */
export async function triggerBackendSync(
  date?: string,
  days: number = 1,
  syncKey?: string
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (syncKey) {
      headers['Authorization'] = `Bearer ${syncKey}`;
    }

    const response = await fetch(`${API_BASE}/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ date, days }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Error triggering backend sync:', error);
    return false;
  }
}

/**
 * Check if backend is available
 */
export async function isBackendAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/status`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
}
