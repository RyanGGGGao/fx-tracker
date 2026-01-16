import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Currency API configuration
const CURRENCY_API_KEY = process.env.VITE_CURRENCY_API_KEY || process.env.CURRENCY_API_KEY || '';
const CURRENCY_API_BASE = 'https://api.currencyapi.com/v3';

// Base currency pairs to sync
const BASE_PAIRS = [
  { from: 'USD', to: 'CNY' },
  { from: 'EUR', to: 'CNY' },
  { from: 'GBP', to: 'CNY' },
  { from: 'JPY', to: 'CNY' },
  { from: 'AUD', to: 'CNY' },
  { from: 'CAD', to: 'CNY' },
  { from: 'HKD', to: 'CNY' },
  { from: 'SGD', to: 'CNY' },
];

interface HistoricalRateResponse {
  meta: { last_updated_at: string };
  data: Record<string, { code: string; value: number }>;
}

async function fetchHistoricalRate(date: string, baseCurrency: string): Promise<HistoricalRateResponse | null> {
  try {
    const url = `${CURRENCY_API_BASE}/historical?apikey=${CURRENCY_API_KEY}&date=${date}&base_currency=${baseCurrency}&currencies=CNY,USD,EUR,GBP,JPY,AUD,CAD,HKD,SGD`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`API error for ${date}: ${response.status}`);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Fetch error for ${date}:`, error);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check authorization (simple API key check)
  const authHeader = req.headers.authorization;
  const syncKey = process.env.SYNC_API_KEY;
  
  if (syncKey && authHeader !== `Bearer ${syncKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { date, days = 1 } = req.body;
    
    // Calculate dates to sync
    const datesToSync: string[] = [];
    const startDate = date ? new Date(date) : new Date();
    
    for (let i = 0; i < Math.min(days, 30); i++) { // Max 30 days per request
      const d = new Date(startDate);
      d.setDate(d.getDate() - i);
      datesToSync.push(d.toISOString().split('T')[0]);
    }

    const results: { date: string; success: boolean; error?: string }[] = [];
    let totalSaved = 0;

    for (const syncDate of datesToSync) {
      try {
        // Fetch rate with USD as base (most common)
        const usdData = await fetchHistoricalRate(syncDate, 'USD');
        
        if (!usdData) {
          results.push({ date: syncDate, success: false, error: 'API fetch failed' });
          continue;
        }

        const records: any[] = [];
        
        // Calculate rates for all pairs
        const cnyRate = usdData.data.CNY?.value || 1;
        
        for (const pair of BASE_PAIRS) {
          let rate: number;
          
          if (pair.from === 'USD') {
            rate = cnyRate;
          } else {
            const fromRate = usdData.data[pair.from]?.value;
            if (fromRate) {
              // Convert: FROM -> USD -> CNY
              rate = cnyRate / fromRate;
            } else {
              continue;
            }
          }
          
          records.push({
            from_currency: pair.from,
            to_currency: pair.to,
            date: syncDate,
            open: rate,
            high: rate,
            low: rate,
            close: rate,
            updated_at: new Date().toISOString(),
          });
        }

        // Save to database
        const { error } = await supabase
          .from('exchange_rates')
          .upsert(records, {
            onConflict: 'from_currency,to_currency,date',
            ignoreDuplicates: false,
          });

        if (error) {
          results.push({ date: syncDate, success: false, error: error.message });
        } else {
          results.push({ date: syncDate, success: true });
          totalSaved += records.length;
        }

        // Rate limiting - wait between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        results.push({ date: syncDate, success: false, error: String(error) });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Synced ${totalSaved} records for ${datesToSync.length} dates`,
      results,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
