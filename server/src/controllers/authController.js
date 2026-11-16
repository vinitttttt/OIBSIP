import { endpointNotImplemented } from '../services/authService.js';
import { registerCustomer, resendCustomerVerification, verifyCustomerEmail } from '../services/authService.js';
import { serializeSafeUser } from '../models/User.js';

export async function register(req, res, next) {
  try {
    const { user, emailSent } = await registerCustomer(req.body);
    res.status(201).json({
      message: emailSent
        ? 'Your account was created. Check your email for a verification link.'
        : 'Your account was created. You can request a verification email shortly.',
      user: serializeSafeUser(user),
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyEmail(req, res, next) {
  try {
    const user = await verifyCustomerEmail(req.body.token);
    res.status(200).json({ message: 'Your email has been verified.', user: serializeSafeUser(user) });
  } catch (error) {
    next(error);
  }
}

export async function resendVerification(req, res, next) {
  try {
    const result = await resendCustomerVerification(req.body.email);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export function notImplemented(_req, _res, next) {
  try {
    endpointNotImplemented();
  } catch (error) {
    next(error);
  }
}
