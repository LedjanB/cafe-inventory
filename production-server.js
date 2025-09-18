const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize SQLite database
const dbPath = path.join(__dirname, 'inventory.db');
const db = new sqlite3.Database(dbPath);

// Create table if it doesn't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_name TEXT NOT NULL,
        date TEXT NOT NULL,
        yesterday_count INTEGER DEFAULT 0,
        current_count INTEGER NOT NULL,
        restocks_received INTEGER DEFAULT 0,
        sold_calculated INTEGER DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(item_name, date)
    )`);
});

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// Get yesterday's date
function getYesterdayDate() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
}

// API Routes
app.get('/api/counts/today', (req, res) => {
    const today = getTodayDate();
    
    db.all('SELECT * FROM inventory WHERE date = ? ORDER BY item_name', [today], (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

app.post('/api/counts', (req, res) => {
    const { item_name, current_count, restocks_received } = req.body;
    
    if (!item_name || current_count === undefined || restocks_received === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const today = getTodayDate();
    const yesterday = getYesterdayDate();
    
    // Get yesterday's count for this item
    db.get('SELECT current_count FROM inventory WHERE item_name = ? AND date = ?', 
        [item_name, yesterday], (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        let yesterday_count = 0;
        let sold_calculated = 0;
        
        if (row) {
            yesterday_count = row.current_count;
            sold_calculated = Math.max(0, yesterday_count + parseInt(restocks_received) - parseInt(current_count));
        }
        
        // Insert or update today's record
        db.run(`INSERT OR REPLACE INTO inventory 
                (item_name, date, yesterday_count, current_count, restocks_received, sold_calculated) 
                VALUES (?, ?, ?, ?, ?, ?)`,
            [item_name, today, yesterday_count, parseInt(current_count), parseInt(restocks_received), sold_calculated],
            function(err) {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Failed to save count' });
                }
                
                res.json({
                    success: true,
                    message: row ? `Sales calculated: ${sold_calculated} items sold!` : 'Initial count recorded!',
                    sold_calculated,
                    item_name,
                    yesterday_count,
                    current_count: parseInt(current_count),
                    restocks_received: parseInt(restocks_received),
                    date: today
                });
            });
    });
});

app.get('/api/history', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Get total count
    db.get('SELECT COUNT(*) as total FROM inventory', (err, countRow) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        // Get paginated data
        db.all('SELECT * FROM inventory ORDER BY date DESC, item_name ASC LIMIT ? OFFSET ?', 
            [limit, offset], (err, rows) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            res.json({
                data: rows,
                pagination: {
                    page,
                    limit,
                    total: countRow.total,
                    totalPages: Math.ceil(countRow.total / limit)
                }
            });
        });
    });
});

app.get('/api/summary', (req, res) => {
    const { days, startDate, endDate } = req.query;
    let whereClause = '';
    let params = [];
    
    if (days) {
        const date = new Date();
        date.setDate(date.getDate() - parseInt(days));
        whereClause = 'WHERE date >= ?';
        params.push(date.toISOString().split('T')[0]);
    } else if (startDate && endDate) {
        whereClause = 'WHERE date >= ? AND date <= ?';
        params.push(startDate, endDate);
    }
    
    const query = `
        SELECT 
            item_name,
            SUM(sold_calculated) as total_sold,
            SUM(restocks_received) as total_restocked,
            AVG(yesterday_count) as avg_starting_stock,
            MAX(current_count) as current_stock,
            COUNT(*) as days_tracked
        FROM inventory 
        ${whereClause}
        GROUP BY item_name
        ORDER BY item_name
    `;
    
    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        const enhancedRows = rows.map(row => ({
            item_name: row.item_name,
            total_stock: Math.round((row.avg_starting_stock + row.total_restocked) * 100) / 100,
            total_sold: row.total_sold,
            total_restocked: row.total_restocked,
            avg_starting_stock: Math.round(row.avg_starting_stock * 100) / 100,
            current_stock: row.current_stock,
            days_tracked: row.days_tracked,
            turnover_rate: row.avg_starting_stock > 0 && row.days_tracked > 0
                ? Math.round((row.total_sold / row.avg_starting_stock / row.days_tracked) * 100 * 100) / 100
                : 0
        }));
        
        res.json(enhancedRows);
    });
});

app.delete('/api/counts/:itemName/:date', (req, res) => {
    const { itemName, date } = req.params;
    
    db.run('DELETE FROM inventory WHERE item_name = ? AND date = ?', 
        [decodeURIComponent(itemName), date], function(err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to delete entry' });
        }
        
        res.json({ 
            success: true, 
            message: 'Entry deleted successfully',
            changes: this.changes
        });
    });
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
    console.log(`🚀 Cafe Inventory System running on port ${port}`);
    console.log(`📊 Database: ${dbPath}`);
    console.log(`✅ Ready for production!`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('✅ Database connection closed');
        }
        process.exit(0);
    });
});
