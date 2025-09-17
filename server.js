const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Supabase configuration - Render handles env vars properly
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aunxklyjxakbprknyisr.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1bnhrbHlqeGFrYnBya255aXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgwNTcxMTksImV4cCI6MjA3MzYzMzExOX0.sfN0rYnz7gKYj4eHXakgmBerfzvEmScK7hJwrSrvM-s';

console.log('🚀 Render deployment starting...');
console.log('✅ App running on port:', port);

// Helper function for Supabase API calls
async function supabaseQuery(endpoint, options = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    const response = await fetch(url, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Supabase API error: ${response.status} ${error}`);
    }
    
    return response.json();
}

// Initialize database
async function initializeDatabase() {
    try {
        // Just test the connection by trying to fetch from history table
        await supabaseQuery('history?limit=1');
        console.log('Supabase database connection verified');
    } catch (err) {
        console.error('Database connection error:', err);
        console.log('Make sure the history table exists in your Supabase database');
    }
}

// API Routes
app.get('/api/counts/today', async (req, res) => {
    try {
        console.log('Getting today\'s counts...');
        
        const today = new Date().toISOString().split('T')[0];
        console.log('Today\'s date:', today);
        
        const result = await supabaseQuery(`history?date=eq.${today}`);
        
        console.log('Query result:', result.length, 'rows');
        
        res.json(result);
    } catch (err) {
        console.error('Error fetching today\'s counts:', err);
        res.status(500).json({ error: 'Failed to fetch today\'s counts' });
    }
});

app.post('/api/counts', async (req, res) => {
    const { item_name, current_count, restocks_received } = req.body;
    
    if (!item_name || current_count === undefined || restocks_received === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        // Get yesterday's ending count (which becomes today's starting count)
        const yesterdayResult = await supabaseQuery(`history?item_name=eq.${encodeURIComponent(item_name)}&date=eq.${yesterdayStr}&select=current_count`);
        
        let sold_calculated = 0;
        let starting_count = 0;
        
        if (yesterdayResult.length > 0) {
            // Normal day: use yesterday's ending count as starting count
            starting_count = yesterdayResult[0].current_count;
            sold_calculated = Math.max(0, starting_count + parseInt(restocks_received) - parseInt(current_count));
        } else {
            // First day for this item: current_count is the initial stock, no sales calculated yet
            starting_count = parseInt(current_count);
            sold_calculated = 0;
        }
        
        // Insert or update today's count using upsert
        const upsertData = {
            item_name,
            date: today,
            yesterday_count: starting_count,
            current_count: parseInt(current_count),
            restocks_received: parseInt(restocks_received),
            sold_calculated
        };

        await supabaseQuery('history', {
            method: 'POST',
            headers: {
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(upsertData)
        });
        
        res.status(200).json({ 
            success: true,
            message: yesterdayResult.length > 0 ? `Sales calculated: ${sold_calculated} items sold yesterday!` : 'Initial count recorded!',
            sold_calculated: sold_calculated,
            item_name: item_name,
            starting_count: starting_count,
            current_count: parseInt(current_count),
            restocks_received: parseInt(restocks_received),
            date: today,
            is_first_day: yesterdayResult.length === 0
        });
    } catch (err) {
        console.error('Error saving count:', err);
        res.status(500).json({ error: 'Failed to save count' });
    }
});

app.get('/api/history', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        // Get total count first - use proper PostgREST count syntax
        const countResponse = await fetch(`${SUPABASE_URL}/rest/v1/history?select=*`, {
            method: 'HEAD',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Prefer': 'count=exact'
            }
        });
        
        const totalCount = parseInt(countResponse.headers.get('content-range')?.split('/')[1] || '0');
        
        // Get paginated data
        const data = await supabaseQuery(`history?select=*&order=date.desc,item_name.asc&limit=${limit}&offset=${offset}`);
        
        res.json({
            data: data,
            pagination: {
                page: page,
                limit: limit,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
    } catch (err) {
        console.error('Error fetching history:', err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

app.get('/api/summary', async (req, res) => {
    const { days, startDate, endDate } = req.query;
    
    try {
        let query = 'history?select=*';
        
        if (days) {
            const date = new Date();
            date.setDate(date.getDate() - parseInt(days));
            const dateStr = date.toISOString().split('T')[0];
            query += `&date=gte.${dateStr}`;
        } else if (startDate && endDate) {
            query += `&date=gte.${startDate}&date=lte.${endDate}`;
        }
        
        const summaryResult = await supabaseQuery(query);
        
        // Group by item_name and calculate aggregates
        const itemGroups = {};
        summaryResult.forEach(row => {
            if (!itemGroups[row.item_name]) {
                itemGroups[row.item_name] = {
                    item_name: row.item_name,
                    total_sold: 0,
                    total_restocked: 0,
                    current_stock: 0,
                    starting_stocks: [],
                    days_tracked: 0
                };
            }
            
            itemGroups[row.item_name].total_sold += row.sold_calculated || 0;
            itemGroups[row.item_name].total_restocked += row.restocks_received || 0;
            itemGroups[row.item_name].current_stock = row.current_count || 0;
            itemGroups[row.item_name].starting_stocks.push(row.yesterday_count || 0);
            itemGroups[row.item_name].days_tracked++;
        });
        
        // Calculate averages and turnover rates
        const enhancedRows = Object.values(itemGroups).map(item => {
            const avg_starting_stock = item.starting_stocks.length > 0 
                ? item.starting_stocks.reduce((a, b) => a + b, 0) / item.starting_stocks.length 
                : 0;
            
            const turnover_rate = avg_starting_stock > 0 && item.days_tracked > 0
                ? (item.total_sold / avg_starting_stock / item.days_tracked) * 100
                : 0;
            
            return {
                item_name: item.item_name,
                total_sold: item.total_sold,
                total_restocked: item.total_restocked,
                avg_starting_stock: Math.round(avg_starting_stock * 100) / 100,
                current_stock: item.current_stock,
                days_tracked: item.days_tracked,
                turnover_rate: Math.round(turnover_rate * 100) / 100
            };
        });
        
        res.json(enhancedRows);
    } catch (err) {
        console.error('Error fetching summary:', err);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

// DELETE endpoint for removing entries
app.delete('/api/counts/:itemName/:date', async (req, res) => {
    const { itemName, date } = req.params;
    
    try {
        const result = await supabaseQuery(`history?item_name=eq.${encodeURIComponent(itemName)}&date=eq.${date}`, {
            method: 'DELETE'
        });
        
        res.json({ success: true, message: 'Entry deleted successfully' });
    } catch (err) {
        console.error('Error deleting entry:', err);
        res.status(500).json({ error: 'Failed to delete entry' });
    }
});

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/history', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'history.html'));
});

app.get('/summary', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'summary.html'));
});

// Start server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    initializeDatabase();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    process.exit(1);
});