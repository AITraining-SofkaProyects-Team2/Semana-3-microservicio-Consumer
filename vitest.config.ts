import { defineConfig } from 'vitest/config';
import type { UserConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/scripts/**',
        'src/lifecycle/**',
        'src/utils/database.ts',
        'src/utils/logger.ts', // Usually low coverage due to console usage
        'src/repositories/PostgresIncidentRepository.ts' // Requires complex DB mocking
      ],
    },
  },
} as UserConfig);
