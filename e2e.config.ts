import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

export default {
  workers: 1,
  assertionTimeout: 25000,
  targets: [{
    engine: web(),
    app: {
      url: process.env.APP_URL ?? 'http://localhost:5174',
    },
  }],
} satisfies E2EConfig;

