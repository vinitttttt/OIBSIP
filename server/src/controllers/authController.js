import { login, logout, refresh, registerCustomer, requestPasswordReset, resendCustomerVerification, resetPassword, verifyCustomerEmail } from '../services/authService.js';
import { serializeSafeUser } from '../models/User.js';
import { getRefreshCookieOptions } from '../utils/refreshCookie.js';
import { User } from '../models/User.js';

function sendSession(res, session, audience = 'customer') {
  res.cookie(audience === 'admin' ? 'pizzahop_admin_refresh' : 'pizzahop_refresh', session.refreshToken, getRefreshCookieOptions(audience));
  res.status(200).json({ accessToken: session.accessToken, user: serializeSafeUser(session.user) });
}
export async function loginCustomer(req, res, next) {
  try { sendSession(res, await login(req.body)); } catch (error) { next(error); }
}
export async function loginAdmin(req, res, next) {
  try { sendSession(res, await login(req.body, 'admin'), 'admin'); } catch (error) { next(error); }
}
export async function refreshCustomer(req, res, next) {
  try { sendSession(res, await refresh(req)); } catch (error) { next(error); }
}
export async function refreshAdmin(req, res, next) {
  try { sendSession(res, await refresh(req, 'admin'), 'admin'); } catch (error) { next(error); }
}
export async function logoutCustomer(req, res, next) {
  try { await logout(req); const { maxAge, ...options } = getRefreshCookieOptions('customer'); res.clearCookie('pizzahop_refresh', options); res.sendStatus(204); } catch (error) { next(error); }
}
export async function logoutAdmin(req, res, next) {
  try { await logout(req, 'admin'); const { maxAge, ...options } = getRefreshCookieOptions('admin'); res.clearCookie('pizzahop_admin_refresh', options); res.sendStatus(204); } catch (error) { next(error); }
}
export async function forgotPassword(req, res, next) {
  try { res.json(await requestPasswordReset(req.body.email)); } catch (error) { next(error); }
}
export async function resetPasswordHandler(req, res, next) {
  try { await resetPassword(req.body.token, req.body.password); res.json({ message: 'Your password has been reset. You can now sign in.' }); } catch (error) { next(error); }
}
export async function currentUser(req, res, next) {
  try {
    const user = await User.findById(req.auth.userId);
    if (!user) return res.sendStatus(401);
    res.json({ user: serializeSafeUser(user) });
  } catch (error) { next(error); }
}
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
