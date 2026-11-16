import { env } from '../../config/env.js';
import { authError } from '../../utils/authErrors.js';
import { MockPaymentProvider } from './mockPaymentProvider.js';

export function createPaymentProvider({ nodeEnv = env.nodeEnv, enabled = env.mockPaymentsEnabled } = {}) {
  if (nodeEnv === 'production' || !enabled) {
    throw authError(503, 'PAYMENTS_UNAVAILABLE', 'Simulated payments are unavailable in this environment.');
  }
  return new MockPaymentProvider();
}
