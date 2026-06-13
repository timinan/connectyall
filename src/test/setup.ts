import { config } from 'dotenv';
import path from 'node:path';
import { afterEach } from 'vitest';
import { resetEnvCache } from '@/lib/env';

config({ path: path.resolve(process.cwd(), '.env.test.local'), override: true });

afterEach(() => {
  resetEnvCache();
});
