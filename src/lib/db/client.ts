import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import { env } from '../env';
import * as schema from './schema';

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function db() {
  if (!cachedDb) {
    const pool = new Pool({ connectionString: env().DATABASE_URL });
    cachedDb = drizzle(pool, { schema });
  }
  return cachedDb;
}
