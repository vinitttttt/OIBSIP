import { authError } from '../utils/authErrors.js';

export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) return next(authError(400, 'INVALID_REQUEST', 'Request body is invalid.'));
    req.validatedBody = result.data;
    return next();
  };
}
