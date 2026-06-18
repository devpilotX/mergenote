import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('Running migrations...');

    // Read migration files sorted by name
    const migrationsDir = join(__dirname, '..', 'migrations');
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const name = file.replace('.sql', '');

      // Check if already applied
      try {
        const result = await pool.query('SELECT id FROM migrations WHERE name = $1', [name]);
        if (result.rows.length > 0) {
          console.log(`  [skip] ${name} (already applied)`);
          continue;
        }
      } catch {
        // migrations table might not exist yet, that is fine
      }

      // Read and execute the migration
      const sql = readFileSync(join(migrationsDir, file), 'utf-8');
      await pool.query(sql);

      // Record the migration (table was created by the SQL above on first run)
      await pool.query('INSERT INTO migrations (name) VALUES ($1)', [name]);
      console.log(`  [done] ${name}`);
    }

    console.log('All migrations applied.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
