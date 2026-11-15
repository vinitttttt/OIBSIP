export function authError(status, code, message) {
  return Object.assign(new Error(message), { status, code, expose: true });
}

export const unauthorizedError = () => authError(401, 'UNAUTHORIZED', 'Authentication is required.');
export const forbiddenError = () => authError(403, 'FORBIDDEN', 'You do not have permission to access this resource.');
