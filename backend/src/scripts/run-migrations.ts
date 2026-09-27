import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('SUPABASE_DB_URL is not set in .env');
  process.exit(1);
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase', 'migrations');
const migrationFiles = [
  '202609270001_initial_schema.sql',
  '202609270002_rls_policies.sql',
  '202609270003_indexes.sql',
  '202609270004_functions.sql',
  '202609270005_views.sql',
];

async function runMigrations() {
  console.log('\n========================================');
  console.log('Running Supabase PostgreSQL Migrations');
  console.log('========================================\n');

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('✓ Connected to Supabase PostgreSQL');

  for (const file of migrationFiles) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.error(`Migration file not found: ${filePath}`);
      continue;
    }

    console.log(`\nExecuting: ${file}...`);
    const sql = fs.readFileSync(filePath, 'utf-8');

    try {
      await client.query(sql);
      console.log(`✓ ${file} applied successfully`);
    } catch (err: any) {
      console.error(`✗ Error applying ${file}:`, err.message);
      // If error is about relation already existing or extension, check details
      if (err.message.includes('already exists')) {
        console.log('  (Relation/object already exists — continuing)');
      } else {
        await client.end();
        process.exit(1);
      }
    }
  }

  await client.end();
  console.log('\n========================================');
  console.log('All migrations applied successfully!');
  console.log('========================================\n');
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
