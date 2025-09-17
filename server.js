const express = require('express');
const { Pool } = require('pg');
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

// Database configuration
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database
async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS history (
                id SERIAL PRIMARY KEY,
                item_name VARCHAR(255) NOT NULL,
                date DATE NOT NULL DEFAULT CURRENT_DATE,
                yesterday_count INTEGER DEFAULT 0,
                current_count INTEGER NOT NULL,
                restocks_received INTEGER DEFAULT 0,
                sold_calculated INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(item_name, date)
            )
        `);
        
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_history_item_date 
            ON history(item_name, date)
        `);
        
        console.log('PostgreSQL database initialized');
    } catch (err) {
        console.error('Database initialization error:', err);
    }
}

// Initialize database on startup
initializeDatabase();

// API Routes
app.get('/api/counts/today', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const result = await pool.query('SELECT * FROM history WHERE date = $1', [today]);
        res.json(result.rows);
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
        const yesterdayResult = await pool.query('SELECT current_count FROM history WHERE item_name = $1 AND date = $2 ORDER BY id DESC LIMIT 1', 
               [item_name, yesterdayStr]);
        
        let sold_calculated = 0;
        let starting_count = 0;
        
        if (yesterdayResult.rows.length > 0) {
            // Normal day: use yesterday's ending count as starting count
            starting_count = yesterdayResult.rows[0].current_count;
            sold_calculated = Math.max(0, starting_count + parseInt(restocks_received) - parseInt(current_count));
        } else {
            // First day for this item: current_count is the initial stock, no sales calculated yet
            starting_count = parseInt(current_count);
            sold_calculated = 0;
        }
        
        // Insert or update today's count
        await pool.query(`
            INSERT INTO history (item_name, date, yesterday_count, current_count, restocks_received, sold_calculated)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (item_name, date) DO UPDATE SET
                yesterday_count = $3,
                current_count = $4,
                restocks_received = $5,
                sold_calculated = $6
        `, [item_name, today, starting_count, parseInt(current_count), parseInt(restocks_received), sold_calculated]);
        
        res.status(200).json({ 
            success: true,
            message: yesterdayResult.rows.length > 0 ? `Sales calculated: ${sold_calculated} items sold yesterday!` : 'Initial count recorded!',
            sold_calculated: sold_calculated,
            item_name: item_name,
            starting_count: starting_count,
            current_count: parseInt(current_count),
            restocks_received: parseInt(restocks_received),
            date: today,
            is_first_day: yesterdayResult.rows.length === 0
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
        const countResult = await pool.query('SELECT COUNT(*) as count FROM history');
        const total = countResult.rows[0].count;
        
        const historyResult = await pool.query('SELECT * FROM history ORDER BY date DESC, id DESC LIMIT $1 OFFSET $2', [parseInt(limit), parseInt(offset)]);
        
        res.json({
            data: historyResult.rows,
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
        let query = `
            SELECT 
                item_name,
                SUM(sold_calculated) as total_sold,
                SUM(restocks_received) as total_restocked,
                AVG(yesterday_count) as avg_starting_stock,
                COUNT(*) as days_tracked,
                (SELECT current_count FROM history h2 
                 WHERE h2.item_name = h.item_name 
                 ORDER BY h2.date DESC, h2.id DESC LIMIT 1) as current_stock
            FROM history h
        `;
        
        const params = [];
        
        if (days) {
            const date = new Date();
            date.setDate(date.getDate() - parseInt(days));
            query += ' WHERE h.date >= $1';
            params.push(date.toISOString().split('T')[0]);
        } else if (startDate && endDate) {
            query += ' WHERE h.date BETWEEN $1 AND $2';
            params.push(startDate, endDate);
        }
        
        query += ' GROUP BY item_name ORDER BY total_sold DESC';
        
        const summaryResult = await pool.query(query, params);
        
        // Simple calculation for display
        const enhancedRows = summaryResult.rows.map(row => ({
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
        const result = await pool.query('DELETE FROM history WHERE item_name = $1 AND date = $2', [itemName, date]);
        
        if (result.rowCount === 0) {
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