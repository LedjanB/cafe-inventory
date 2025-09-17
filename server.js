const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Explicit routes for static files (Vercel fix)
app.get('/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'style.css'));
});

app.get('/script.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'script.js'));
});

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_KEY;

// Helper function for Supabase API calls
async function supabaseQuery(endpoint, options = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    const response = await fetch(url, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
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
        await supabaseQuery('history', {
            method: 'POST',
            body: JSON.stringify({
                select: '*',
                eq: 'id',
                neq: 'id'
            })
        });
        
        console.log('Supabase database initialized');
    } catch (err) {
        console.error('Database initialization error:', err);
    }
}

// Initialize database on startup
initializeDatabase();

// API Routes
app.get('/api/counts/today', async (req, res) => {
    try {
        console.log('Getting today\'s counts...');
        
        const today = new Date().toISOString().split('T')[0];
        console.log('Today\'s date:', today);
        
        const result = await supabaseQuery('history', {
            method: 'GET',
            headers: {
                'Range': '0-9'
            },
            body: JSON.stringify({
                select: '*',
                eq: 'date',
                eq: today
            })
        });
        
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
        const yesterdayResult = await supabaseQuery('history', {
            method: 'GET',
            headers: {
                'Range': '0-0'
            },
            body: JSON.stringify({
                select: 'current_count',
                eq: 'item_name',
                eq: item_name,
                eq: 'date',
                eq: yesterdayStr
            })
        });
        
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
        
        // Insert or update today's count
        await supabaseQuery('history', {
            method: 'POST',
            body: JSON.stringify({
                item_name,
                date: today,
                yesterday_count: starting_count,
                current_count: parseInt(current_count),
                restocks_received: parseInt(restocks_received),
                sold_calculated
            })
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
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    try {
        const countResult = await supabaseQuery('history', {
            method: 'HEAD'
        });
        
        const total = parseInt(countResult.headers.get('row-count'));
        
        const historyResult = await supabaseQuery('history', {
            method: 'GET',
            headers: {
                'Range': `${offset}-${offset + limit - 1}`
            }
        });
        
        res.json({
            data: historyResult,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        console.error('Error fetching history:', err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

app.get('/api/summary', async (req, res) => {
    const { days, startDate, endDate } = req.query;
    
    try {
        let query = '';
        
        const params = [];
        
        if (days) {
            const date = new Date();
            date.setDate(date.getDate() - parseInt(days));
            query += `?eq(date,${date.toISOString().split('T')[0]})`;
        } else if (startDate && endDate) {
            query += `?between(date,${startDate},${endDate})`;
        }
        
        const summaryResult = await supabaseQuery(`history${query}`, {
            method: 'GET'
        });
        
        // Simple calculation for display
        const enhancedRows = summaryResult.map(row => ({
            ...row,
            avg_starting_stock: Math.round(row.avg_starting_stock * 100) / 100,
            turnover_rate: row.avg_starting_stock > 0 
                ? Math.round((row.total_sold / row.avg_starting_stock / row.days_tracked) * 10000) / 100
                : 0
        }));
        
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
        const result = await supabaseQuery(`history?eq(item_name,${itemName})&eq(date,${date})`, {
            method: 'DELETE'
        });
        
        if (result.length === 0) {
            res.status(404).json({ error: 'Entry not found' });
        } else {
            res.json({ success: true, message: 'Entry deleted successfully' });
        }
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
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    process.exit(1);
});