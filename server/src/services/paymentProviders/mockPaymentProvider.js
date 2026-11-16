import { randomUUID } from 'node:crypto';
import { generateOpaqueToken } from '../../utils/tokens.js';
import { authError } from '../../utils/authErrors.js';

export class MockPaymentProvider {
  constructor() { this.name = 'mock'; }

  initialize() {
    return {
      providerReference: `mock_${randomUUID()}`,
      confirmationToken: generateOpaqueToken(),
    };
  }

  simulateOutcome(outcome) {
    if (!['success', 'failure'].includes(outcome)) throw authError(400, 'INVALID_MOCK_OUTCOME', 'Choose a supported simulated payment outcome.');
    return { outcome, status: outcome === 'success' ? 'succeeded' : 'failed', completedAt: new Date() };
  }
}
