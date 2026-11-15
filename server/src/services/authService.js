import { authError } from '../utils/authErrors.js';

export function endpointNotImplemented() {
  throw authError(501, 'AUTH_FLOW_NOT_IMPLEMENTED', 'This authentication flow is not available yet.');
}
