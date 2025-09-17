# Quick Database Setup - Get Live in 5 Minutes

## Option 1: Supabase (Recommended - Free Forever)

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project" → Sign up with GitHub/Google
3. Create new project:
   - Name: `cafe-inventory`
   - Database Password: (save this!)
   - Region: Choose closest to you
4. Wait 2 minutes for setup
5. Go to Settings → Database → Connection string
6. Copy the connection string (looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres`)

## Option 2: Railway (Also Free)

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. New Project → Add PostgreSQL
4. Click on PostgreSQL service → Connect tab
5. Copy the "Postgres Connection URL"

## Setup Your App

1. Update your `.env` file:
```bash
DATABASE_URL=your_connection_string_here
NODE_ENV=production
```

2. Install dependencies:
```bash
npm install
```

3. Create the table (run this in Supabase SQL Editor or Railway Query tab):
```sql
CREATE TABLE IF NOT EXISTS history (
    id SERIAL PRIMARY KEY,
    item_name VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    current_count INTEGER NOT NULL,
    restocks_received INTEGER DEFAULT 0,
    sold_calculated INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(item_name, date)
);

CREATE INDEX IF NOT EXISTS idx_history_item_date ON history(item_name, date);
```

4. Start your app:
```bash
npm start
```

## Deploy Options (Free)

- **Render**: Connect GitHub repo, auto-deploys
- **Railway**: Same platform as database
- **Vercel**: Great for Node.js apps

Your app will be live and production-ready!
