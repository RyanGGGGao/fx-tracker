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

      // Supabase has a 1000 row limit per query, use pagination to get all data
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('exchange_rates')
          .select('*')
          .eq('from_currency', from)
          .eq('to_currency', to)
          .order('date', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

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

        if (data && data.length > 0) {
          allData = allData.concat(data);
          hasMore = data.length === PAGE_SIZE;
          page++;
        } else {
          hasMore = false;
        }

        // Safety limit: max 10 pages (10000 records)
        if (page >= 10) {
          hasMore = false;
        }
      }

      return res.status(200).json({
        success: true,
        data: allData,
        count: allData.length,
      });
    }

    if (req.method === 'POST') {
      // Save rates (batch insert)
      const { rates } = req.body;

      if (!rates || !Array.isArray(rates)) {
        return res.status(400).json({ error: 'Missing or invalid rates data' });
      }

      // Return success for empty array (nothing to save)
      if (rates.length === 0) {
        return res.status(200).json({ success: true, message: 'No records to save' });
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
