import type { Config } from 'drizzle-kit';

export default {
  schema: './src/main/services/storage/schema.ts',
  out: './migrations',
  driver: 'better-sqlite',
  dbCredentials: {
    url: './ai-companion.db',
  },
} satisfies Config;
