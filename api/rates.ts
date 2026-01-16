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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Get historical rates
      const { from, to, start_date, end_date } = req.query;

      if (!from || !to) {
        return res.status(400).json({ error: 'Missing from or to currency' });
      }

      let query = supabase
        .from('exchange_rates')
        .select('*')
        .eq('from_currency', from)
        .eq('to_currency', to)
        .order('date', { ascending: true });

      if (start_date) {
        query = query.gte('date', start_date);
      }
      if (end_date) {
        query = query.lte('date', end_date);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Database error', details: error.message });
      }

      return res.status(200).json({
        success: true,
        data: data || [],
        count: data?.length || 0,
      });
    }

    if (req.method === 'POST') {
      // Save rates (batch insert)
      const { rates } = req.body;

      if (!rates || !Array.isArray(rates) || rates.length === 0) {
        return res.status(400).json({ error: 'Missing or invalid rates data' });
      }

      // Prepare data for upsert
      const records = rates.map((rate: any) => ({
        from_currency: rate.from,
        to_currency: rate.to,
        date: rate.date,
        open: rate.open,
        high: rate.high,
        low: rate.low,
        close: rate.close,
        updated_at: new Date().toISOString(),
      }));

      // Upsert (insert or update on conflict)
      const { data, error } = await supabase
        .from('exchange_rates')
        .upsert(records, {
          onConflict: 'from_currency,to_currency,date',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('Supabase error:', error);
        return res.status(500).json({ error: 'Database error', details: error.message });
      }

      return res.status(200).json({
        success: true,
        message: `Saved ${records.length} records`,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
