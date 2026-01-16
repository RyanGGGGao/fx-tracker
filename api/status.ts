import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get database statistics
    const { data: stats, error: statsError } = await supabase
      .from('exchange_rates')
      .select('from_currency, to_currency, date')
      .order('date', { ascending: false });

    if (statsError) {
      return res.status(500).json({ error: 'Database error', details: statsError.message });
    }

    // Calculate statistics
    const pairs = new Map<string, { count: number; latestDate: string; oldestDate: string }>();
    
    for (const record of stats || []) {
      const key = `${record.from_currency}/${record.to_currency}`;
      const existing = pairs.get(key);
      
      if (!existing) {
        pairs.set(key, {
          count: 1,
          latestDate: record.date,
          oldestDate: record.date,
        });
      } else {
        existing.count++;
        if (record.date > existing.latestDate) existing.latestDate = record.date;
        if (record.date < existing.oldestDate) existing.oldestDate = record.date;
      }
    }

    const pairStats = Array.from(pairs.entries()).map(([pair, data]) => ({
      pair,
      ...data,
    }));

    return res.status(200).json({
      success: true,
      totalRecords: stats?.length || 0,
      pairs: pairStats,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
