import { endpointNotImplemented } from '../services/authService.js';

export function notImplemented(_req, _res, next) {
  try {
    endpointNotImplemented();
  } catch (error) {
    next(error);
  }
}
