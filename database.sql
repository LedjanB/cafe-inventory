-- Create the InventoryDB database
CREATE DATABASE InventoryDB;

-- Use the database
\c InventoryDB

-- Create the history table
CREATE TABLE IF NOT EXISTS history (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    yesterday_count INTEGER DEFAULT 0,
    current_count INTEGER NOT NULL,
    restocks_received INTEGER DEFAULT 0,
    sold_calculated INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(item_name, date)
);

-- Create an index for better performance on queries
CREATE INDEX IF NOT EXISTS idx_history_item_date ON history(item_name, date);
