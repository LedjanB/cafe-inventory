# Cafe Inventory Tracking App

A minimal web application for cafe managers to track daily inventory, calculate sales, and detect potential theft by comparing calculated sales with receipt counts.

## Features

- **Daily Count Entry**: Record daily inventory counts with automatic sales calculation
- **History View**: Browse all historical entries with pagination
- **Weekly Summary**: View aggregated data with customizable date ranges
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Real-time Calculations**: Automatically calculates sold items based on previous counts and restocks

## Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js with Express.js
- **Database**: SQL Server (local installation required)

## Prerequisites

Before setting up the application, ensure you have:

1. **Node.js** (version 14 or higher) - [Download here](https://nodejs.org/)
2. **SQL Server** (Express edition is sufficient) - [Download here](https://www.microsoft.com/en-us/sql-server/sql-server-downloads)
3. **SQL Server Management Studio** (optional but recommended) - [Download here](https://docs.microsoft.com/en-us/sql/ssms/download-sql-server-management-studio-ssms)

## Installation & Setup

### 1. Clone/Download the Project

```bash
# If using Git
git clone <repository-url>
cd cafe-inventory-tracker

# Or extract the downloaded ZIP file to your desired location
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up the Database

#### Option A: Using SQL Server Management Studio
1. Open SQL Server Management Studio
2. Connect to your local SQL Server instance
3. Open the `database.sql` file
4. Execute the script to create the database and table

#### Option B: Using Command Line (sqlcmd)
```bash
sqlcmd -S localhost -E -i database.sql
```

### 4. Configure Database Connection

The application is configured to connect to SQL Server using Windows Authentication. If you need to modify the connection settings, edit the `config` object in `server.js`:

```javascript
const config = {
    server: 'localhost',           // Your SQL Server instance
    database: 'InventoryDB',
    options: {
        trustedConnection: true,   // Use Windows Authentication
        enableArithAbort: true,
        encrypt: false,
        trustServerCertificate: true
    }
};
```

For SQL Server Authentication, modify the config:
```javascript
const config = {
    server: 'localhost',
    database: 'InventoryDB',
    user: 'your_username',        // Add username
    password: 'your_password',    // Add password
    options: {
        enableArithAbort: true,
        encrypt: false,
        trustServerCertificate: true
    }
};
```

### 5. Start the Application

```bash
# For development (with auto-restart)
npm run dev

# For production
npm start
```

The application will be available at: `http://localhost:3000`

## Usage Guide

### Daily Count Entry

1. Navigate to the **Daily Count** page (home page)
2. Enter the item name (e.g., "Colas", "Coffee", "Sandwiches")
3. Enter the current physical count
4. Optionally enter any restocks received since yesterday
5. Click **Save Count**

The system automatically calculates sold items using the formula:
```
Sold = Previous Day Count + Restocks Received - Current Count
```

### Viewing History

1. Navigate to the **History** page
2. Browse all entries sorted by date (newest first)
3. Use pagination controls to navigate through records
4. Each entry shows: Date, Item Name, Current Count, Restocks, and Calculated Sales

### Weekly Summary

1. Navigate to the **Weekly Summary** page
2. Use the filter options:
   - **Days to Show**: Select 7, 14, or 30 days
   - **Custom Date Range**: Use From/To date pickers for specific periods
3. Click **Apply Filter** to update the summary
4. View aggregated totals for each item and overall statistics

## Business Logic

### Core Calculation

The application tracks inventory using a simple but effective method:

1. **First Entry**: When you first enter an item, no sales are calculated
2. **Subsequent Entries**: Sales = (Previous Count + Restocks) - Current Count
3. **Negative Sales**: If the calculation results in negative sales, it's set to 0

### Example Scenarios

**Day 1**: 50 Colas counted
- Current Count: 50, Restocks: 0, Calculated Sold: 0

**Day 2**: 40 Colas counted, no restocks
- Current Count: 40, Restocks: 0, Calculated Sold: 10

**Day 3**: 60 Colas counted, received 30 restock
- Current Count: 60, Restocks: 30, Calculated Sold: 20

### Theft Detection

Compare the app's calculated sales with your physical receipt counts:
- **Match**: Normal operations
- **App shows higher sales**: Potential data entry error
- **App shows lower sales**: Potential theft or unrecorded restocks

## File Structure

```
cafe-inventory-tracker/
├── package.json              # Dependencies and scripts
├── server.js                 # Express server and API endpoints
├── database.sql              # Database schema
├── README.md                 # This file
└── public/                   # Frontend files
    ├── index.html           # Daily Count page
    ├── history.html         # History page
    ├── summary.html         # Weekly Summary page
    ├── style.css            # Styling
    └── script.js            # Frontend JavaScript
```

## API Endpoints

### POST /api/counts
Save a daily count entry
```json
{
  "item_name": "Colas",
  "current_count": 45,
  "restocks_received": 0
}
```

### GET /api/counts/today
Get today's entries

### GET /api/history?page=1&limit=20
Get paginated history

### GET /api/summary?days=7
Get summary for last N days

### GET /api/summary?from_date=2024-01-01&to_date=2024-01-07
Get summary for date range

## Troubleshooting

### Database Connection Issues

**Error**: "Login failed for user"
- **Solution**: Ensure SQL Server is running and Windows Authentication is enabled, or configure SQL Server Authentication

**Error**: "Cannot connect to server"
- **Solution**: Check if SQL Server service is running, verify server name in config

### Application Won't Start

**Error**: "Port 3000 is already in use"
- **Solution**: Change the PORT in server.js or kill the process using port 3000

**Error**: "Module not found"
- **Solution**: Run `npm install` to install dependencies

### Data Issues

**Problem**: Negative sold calculations
- **Cause**: Data entry errors or missed restocks
- **Solution**: Review and correct the entries, ensure all restocks are recorded

**Problem**: Missing previous day data
- **Cause**: First entry for an item or database issues
- **Solution**: Normal for first entries; check database connectivity for ongoing issues

## Development

### Adding New Features

1. **Backend**: Add new routes in `server.js`
2. **Frontend**: Update HTML, CSS, and JavaScript files
3. **Database**: Modify schema in `database.sql` if needed

### Running in Development Mode

```bash
npm run dev
```

This uses nodemon for automatic server restarts when files change.

## Security Considerations

- The application uses Windows Authentication by default (more secure)
- No user authentication is implemented (single-user application)
- Input validation is performed on both frontend and backend
- SQL injection protection through parameterized queries

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify all prerequisites are installed correctly
3. Ensure the database is set up and accessible
4. Check the browser console for JavaScript errors
5. Review server logs for backend issues

## License

MIT License - Feel free to modify and distribute as needed.
