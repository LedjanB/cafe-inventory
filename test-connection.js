const sql = require('mssql');

// Test multiple connection configurations
const configs = [
    {
        name: 'Regular mssql driver with Windows Auth',
        config: {
            server: 'LEDJAN\\SQLEXPRESS01',
            database: 'master',
            options: {
                trustedConnection: true,
                trustServerCertificate: true,
                enableArithAbort: true,
                encrypt: false
            }
        }
    },
    {
        name: 'With explicit port 1433',
        config: {
            server: 'LEDJAN\\SQLEXPRESS01',
            port: 1433,
            database: 'master',
            options: {
                trustedConnection: true,
                trustServerCertificate: true,
                enableArithAbort: true,
                encrypt: false
            }
        }
    },
    {
        name: 'Localhost with instance',
        config: {
            server: 'localhost\\SQLEXPRESS01',
            database: 'master',
            options: {
                trustedConnection: true,
                trustServerCertificate: true,
                enableArithAbort: true,
                encrypt: false
            }
        }
    },
    {
        name: 'Just SQLEXPRESS (common default)',
        config: {
            server: 'LEDJAN\\SQLEXPRESS',
            database: 'master',
            options: {
                trustedConnection: true,
                trustServerCertificate: true,
                enableArithAbort: true,
                encrypt: false
            }
        }
    },
    {
        name: 'Connection string - exact .NET style',
        config: {
            connectionString: 'Data Source=LEDJAN\\SQLEXPRESS01;Initial Catalog=master;Integrated Security=true;TrustServerCertificate=true;Connection Timeout=30;'
        }
    },
    {
        name: 'Connection string - SQLEXPRESS',
        config: {
            connectionString: 'Data Source=LEDJAN\\SQLEXPRESS;Initial Catalog=master;Integrated Security=true;TrustServerCertificate=true;Connection Timeout=30;'
        }
    }
];

async function testAllConfigs() {
    console.log('🔍 Testing multiple SQL Server connection methods...\n');
    
    for (const { name, config } of configs) {
        console.log(`🔄 Testing: ${name}`);
        
        try {
            const pool = await sql.connect(config);
            console.log('✅ Connected successfully!');
            
            // Test query
            const result = await pool.request().query('SELECT @@VERSION as version, @@SERVERNAME as server');
            console.log('Server:', result.recordset[0].server);
            console.log('Version:', result.recordset[0].version.substring(0, 80) + '...');
            
            // Check InventoryDB
            const dbCheck = await pool.request().query(`
                SELECT name FROM sys.databases WHERE name = 'InventoryDB'
            `);
            
            if (dbCheck.recordset.length > 0) {
                console.log('✅ InventoryDB exists');
                
                // Test InventoryDB connection
                await pool.close();
                const inventoryConfig = { ...config };
                if (inventoryConfig.connectionString) {
                    inventoryConfig.connectionString = inventoryConfig.connectionString.replace('Initial Catalog=master', 'Initial Catalog=InventoryDB');
                } else {
                    inventoryConfig.database = 'InventoryDB';
                }
                
                const inventoryPool = await sql.connect(inventoryConfig);
                const tableCheck = await inventoryPool.request().query(`
                    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'history'
                `);
                
                if (tableCheck.recordset.length > 0) {
                    console.log('✅ history table exists');
                    console.log(`\n🎉 SUCCESS! This configuration works:`);
                    console.log(JSON.stringify(config, null, 2));
                } else {
                    console.log('❌ history table missing');
                }
                
                await inventoryPool.close();
                return config; // Return working config
            } else {
                console.log('❌ InventoryDB not found');
            }
            
            await pool.close();
            
        } catch (err) {
            console.log('❌ Failed:', err.message);
        }
        console.log(''); // Empty line for readability
    }
    
    console.log('❌ None of the configurations worked');
    console.log('\n💡 Since your .NET project works, try these manual checks:');
    console.log('1. In SQL Server Management Studio, what exact server name do you use?');
    console.log('2. Check SQL Server Configuration Manager for the actual instance name');
    console.log('3. Run: sqlcmd -L to list all SQL Server instances');
    return null;
}

testAllConfigs();
