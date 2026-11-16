import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { connectDatabase } from '../src/config/database.js';
import { EmailToken } from '../src/models/EmailToken.js';
import { RefreshSession } from '../src/models/RefreshSession.js';
import { serializeSafeUser, User } from '../src/models/User.js';
import { createAuthRateLimiter } from '../src/middleware/authRateLimit.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { comparePassword, hashPassword } from '../src/utils/passwords.js';
import { getRefreshCookieOptions } from '../src/utils/refreshCookie.js';
import { createAccessToken, generateOpaqueToken, hashToken } from '../src/utils/tokens.js';
import { consumeEmailToken } from '../src/services/emailTokenService.js';
import { setEmailSenderForTesting } from '../src/services/emailService.js';
import { bcryptSafePassword, emailSchema, loginPassword, registerSchema, tokenSchema } from '../src/validation/authSchemas.js';

const tag = randomUUID();
const emailFor = (suffix) => `${suffix}-${tag}@example.test`;
const routeRegistrationEmail = emailFor('route-registration');
let server;
let baseUrl;
let customer;
let admin;
let verifiedLogin;
let unverifiedLogin;

before(async () => {
  setEmailSenderForTesting(async () => {});
  await connectDatabase(env.mongoUri);
  await Promise.all([User.init(), EmailToken.init(), RefreshSession.init()]);
  customer = await User.create({ name: 'Review Customer', email: emailFor('customer'), passwordHash: 'test-hash' });
  admin = await User.create({ name: 'Review Admin', email: emailFor('admin'), passwordHash: 'test-hash', role: 'admin' });
  verifiedLogin = await User.create({ name: 'Verified Login', email: emailFor('verified-login'), passwordHash: await hashPassword('CorrectPassword123!'), emailVerifiedAt: new Date() });
  unverifiedLogin = await User.create({ name: 'Unverified Login', email: emailFor('unverified-login'), passwordHash: await hashPassword('CorrectPassword123!') });
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  const routeUser = await User.findOne({ email: routeRegistrationEmail }).select('_id');
  if (customer?._id) await User.deleteOne({ _id: customer._id });
  if (admin?._id) await User.deleteOne({ _id: admin._id });
  if (verifiedLogin?._id) await User.deleteOne({ _id: verifiedLogin._id });
  if (unverifiedLogin?._id) await User.deleteOne({ _id: unverifiedLogin._id });
  if (routeUser?._id) await User.deleteOne({ _id: routeUser._id });
  await EmailToken.deleteMany({ user: { $in: [customer?._id, admin?._id, routeUser?._id].filter(Boolean) } });
  await RefreshSession.deleteMany({ userId: { $in: [customer?._id, admin?._id].filter(Boolean) } });
  if (verifiedLogin?._id) await RefreshSession.deleteMany({ userId: verifiedLogin._id });
  if (unverifiedLogin?._id) await RefreshSession.deleteMany({ userId: unverifiedLogin._id });
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await mongoose.disconnect();
  setEmailSenderForTesting(undefined);
});

test('email validation normalizes addresses and rejects invalid/unknown input', () => {
  assert.deepEqual(emailSchema.parse({ email: '  USER@Example.Test  ' }), { email: 'user@example.test' });
  assert.equal(emailSchema.safeParse({ email: 'not-an-email' }).success, false);
  assert.equal(registerSchema.safeParse({ name: 'User', email: 'a@example.test', password: 'GoodPassword123!', role: 'admin' }).success, false);
  assert.equal(registerSchema.safeParse({ name: 'x'.repeat(101), email: 'a@example.test', password: 'GoodPassword123!' }).success, false);
  assert.equal(registerSchema.safeParse({ name: 'Name\u0000', email: 'a@example.test', password: 'GoodPassword123!' }).success, false);
  assert.equal(tokenSchema.safeParse({ token: 'short' }).success, false);
});

test('password validation enforces policy and bcrypt 72-byte boundary', async () => {
  const valid72 = `Aa1!${'x'.repeat(68)}`;
  const valid73 = `${valid72}x`;
  assert.equal(Buffer.byteLength(valid72), 72);
  assert.equal(bcryptSafePassword.safeParse(valid72).success, true);
  assert.equal(bcryptSafePassword.safeParse(valid73).success, false);
  assert.equal(loginPassword.safeParse(valid72).success, true);
  assert.equal(loginPassword.safeParse(valid73).success, false);
  assert.equal(bcryptSafePassword.safeParse('short').success, false);
  const hash = await hashPassword(valid72);
  assert.equal(await comparePassword(valid72, hash), true);
  assert.equal(await comparePassword(valid73, hash), false);
  assert.throws(() => hashPassword(valid73), /72 UTF-8 bytes/);
});

test('safe user serializer only returns the public allowlist', () => {
  const value = serializeSafeUser({
    _id: '507f1f77bcf86cd799439011', name: 'User', email: 'user@example.test', role: 'customer', emailVerifiedAt: null,
    passwordHash: 'private', refreshSessions: [{ tokenHash: 'private' }], internalAuthMetadata: 'private',
  });
  assert.deepEqual(Object.keys(value).sort(), ['email', 'emailVerifiedAt', 'id', 'name', 'role']);
  assert.equal(JSON.stringify(value).includes('private'), false);
  const serializedDocument = JSON.parse(JSON.stringify(new User({
    name: 'User', email: 'user@example.test', role: 'customer', passwordHash: 'password-private',
    refreshSessions: [{ tokenHash: 'refresh-private' }], internalAuthMetadata: 'metadata-private',
  })));
  assert.deepEqual(Object.keys(serializedDocument).sort(), ['email', 'emailVerifiedAt', 'id', 'name', 'role']);
  assert.equal(JSON.stringify(serializedDocument).includes('private'), false);
  const tokenDocument = new EmailToken({ user: customer?._id, purpose: 'password_reset', tokenHash: 'email-token-private', expiresAt: new Date() });
  assert.equal(JSON.stringify(tokenDocument).includes('email-token-private'), false);
  const sessionDocument = new RefreshSession({ userId: customer?._id, familyId: 'family-private', tokenHash: 'refresh-hash-private', expiresAt: new Date() });
  const sessionJson = JSON.stringify(sessionDocument);
  assert.equal(sessionJson.includes('refresh-hash-private'), false);
  assert.equal(sessionJson.includes('family-private'), false);
});

test('JWT middleware rejects absent, malformed, expired, missing-exp and bad-role tokens', async () => {
  let response = await fetch(`${baseUrl}/auth/me`);
  assert.equal(response.status, 401);
  response = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: 'Bearer malformed' } });
  assert.equal(response.status, 401);
  const expired = jwt.sign({}, env.jwtAccessSecret, { subject: String(customer._id), expiresIn: -1, issuer: 'pizzahop-api', audience: 'pizzahop-client', algorithm: 'HS256' });
  response = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${expired}` } });
  assert.equal(response.status, 401);
  const noExpiry = jwt.sign({}, env.jwtAccessSecret, { subject: String(customer._id), issuer: 'pizzahop-api', audience: 'pizzahop-client', algorithm: 'HS256' });
  response = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${noExpiry}` } });
  assert.equal(response.status, 401);
  const wrongIssuer = jwt.sign({}, env.jwtAccessSecret, { subject: String(customer._id), expiresIn: '1m', issuer: 'wrong-issuer', audience: 'pizzahop-client', algorithm: 'HS256' });
  response = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${wrongIssuer}` } });
  assert.equal(response.status, 401);
  const wrongAudience = jwt.sign({}, env.jwtAccessSecret, { subject: String(customer._id), expiresIn: '1m', issuer: 'pizzahop-api', audience: 'wrong-audience', algorithm: 'HS256' });
  response = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${wrongAudience}` } });
  assert.equal(response.status, 401);
  const forged = jwt.sign({}, 'untrusted-signing-secret', { subject: String(customer._id), expiresIn: '1m', issuer: 'pizzahop-api', audience: 'pizzahop-client', algorithm: 'HS256' });
  response = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${forged}` } });
  assert.equal(response.status, 401);
  const badRole = jwt.sign({ role: 'superuser' }, env.jwtAccessSecret, { subject: String(customer._id), expiresIn: '1m', issuer: 'pizzahop-api', audience: 'pizzahop-client', algorithm: 'HS256' });
  response = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${badRole}` } });
  assert.equal(response.status, 401, 'invalid role claims are rejected');
});

test('customer login requires verified email, refresh rotates, logout revokes, and admin role stays isolated', async () => {
  const post = (path, body, cookie) => fetch(`${baseUrl}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), Origin: env.corsOrigin[0] }, body: JSON.stringify(body ?? {}),
  });
  const creds = { email: verifiedLogin.email, password: 'CorrectPassword123!' };
  let response = await post('/auth/login', { email: unverifiedLogin.email, password: 'CorrectPassword123!' });
  assert.equal(response.status, 403);
  response = await post('/auth/login', { ...creds, password: 'WrongPassword123!' });
  assert.equal(response.status, 401);
  response = await post('/auth/login', creds);
  assert.equal(response.status, 200);
  const loginData = await response.json();
  assert.equal(loginData.user.role, 'customer');
  assert.equal(typeof loginData.accessToken, 'string');
  const firstCookie = response.headers.get('set-cookie').split(';')[0];
  response = await fetch(`${baseUrl}/admin/auth/me`, { headers: { Authorization: `Bearer ${loginData.accessToken}` } });
  assert.equal(response.status, 403);
  response = await post('/auth/refresh', null, firstCookie);
  assert.equal(response.status, 200);
  const rotatedCookie = response.headers.get('set-cookie').split(';')[0];
  assert.notEqual(rotatedCookie, firstCookie);
  response = await post('/auth/refresh', null, firstCookie);
  assert.equal(response.status, 401, 'reuse of the rotated token is rejected');
  response = await post('/auth/refresh', null, rotatedCookie);
  assert.equal(response.status, 401, 'reuse revokes the entire token family');
  response = await post('/auth/login', creds);
  const logoutCookie = response.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/auth/logout', null, logoutCookie)).status, 204);
  assert.equal((await post('/auth/refresh', null, logoutCookie)).status, 401, 'logout revokes its refresh session');
});

test('admin login requires admin role and password reset invalidates sessions', async () => {
  const password = 'CorrectAdmin123!';
  const loginAdmin = await User.create({ name: 'Flow Admin', email: emailFor('flow-admin'), passwordHash: await hashPassword(password), role: 'admin', emailVerifiedAt: new Date() });
  const resetUser = await User.create({ name: 'Reset User', email: emailFor('reset-user'), passwordHash: await hashPassword('OldPassword123!'), emailVerifiedAt: new Date() });
  let resetEmail;
  setEmailSenderForTesting(async (message) => { resetEmail = message; });
  try {
    const badAdmin = await fetch(`${baseUrl}/admin/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: verifiedLogin.email, password: 'CorrectPassword123!' }) });
    assert.equal(badAdmin.status, 401);
    const adminResponse = await fetch(`${baseUrl}/admin/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: loginAdmin.email, password }) });
    assert.equal(adminResponse.status, 200);
    const adminData = await adminResponse.json();
    assert.equal(adminData.user.role, 'admin');

    const loginResponse = await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: resetUser.email, password: 'OldPassword123!' }) });
    const oldSessionCookie = loginResponse.headers.get('set-cookie').split(';')[0];
    const forgotResponse = await fetch(`${baseUrl}/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: resetUser.email }) });
    assert.equal(forgotResponse.status, 200);
    const resetUrl = /href="([^"]*reset-password[^"]*)"/.exec(resetEmail.html)?.[1].replaceAll('&amp;', '&');
    assert(resetUrl);
    const token = new URL(resetUrl).searchParams.get('token');
    const resetResponse = await fetch(`${baseUrl}/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: 'NewPassword123!' }) });
    assert.equal(resetResponse.status, 200);
    assert.equal((await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: resetUser.email, password: 'OldPassword123!' }) })).status, 401);
    assert.equal((await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: resetUser.email, password: 'NewPassword123!' }) })).status, 200);
    assert.equal((await fetch(`${baseUrl}/auth/refresh`, { method: 'POST', headers: { Origin: env.corsOrigin[0], Cookie: oldSessionCookie } })).status, 401);
    assert.equal((await fetch(`${baseUrl}/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: 'OtherPassword123!' }) })).status, 400);
  } finally {
    setEmailSenderForTesting(async () => {});
    await User.deleteMany({ _id: { $in: [loginAdmin._id, resetUser._id] } });
    await EmailToken.deleteMany({ user: { $in: [loginAdmin._id, resetUser._id] } });
    await RefreshSession.deleteMany({ userId: { $in: [loginAdmin._id, resetUser._id] } });
  }
});

test('middleware rejects deleted, inactive, and invalid-role users', async () => {
  const inactive = await User.create({ name: 'Inactive', email: emailFor('inactive'), passwordHash: 'test-hash', isActive: false });
  const inactiveToken = createAccessToken(inactive);
  let response = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${inactiveToken}` } });
  assert.equal(response.status, 401);
  await User.deleteOne({ _id: inactive._id });

  const deletedToken = createAccessToken({ id: new mongoose.Types.ObjectId(), role: 'customer' });
  response = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${deletedToken}` } });
  assert.equal(response.status, 401);

  await User.collection.updateOne({ _id: customer._id }, { $set: { role: 'superuser' } });
  try {
    const token = createAccessToken({ id: customer._id, role: 'customer' });
    response = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 401);
  } finally {
    await User.collection.updateOne({ _id: customer._id }, { $set: { role: 'customer' } });
  }
});

test('admin demotion immediately removes admin access; customer gets 403', async () => {
  const token = createAccessToken(admin);
  let response = await fetch(`${baseUrl}/admin/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  response = await fetch(`${baseUrl}/admin/auth/me`, { headers: { Authorization: `Bearer ${createAccessToken(customer)}` } });
  assert.equal(response.status, 403);
  await User.updateOne({ _id: admin._id }, { $set: { role: 'customer' } });
  try {
    response = await fetch(`${baseUrl}/admin/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 403);
  } finally {
    await User.updateOne({ _id: admin._id }, { $set: { role: 'admin' } });
  }
});

test('email token consumption checks purpose/expiry and permits one concurrent consumer', async () => {
  const raw = generateOpaqueToken();
  const record = await EmailToken.create({ user: customer._id, purpose: 'email_verification', tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 60_000) });
  await assert.rejects(consumeEmailToken({ token: raw, purpose: 'password_reset' }), { code: 'INVALID_OR_EXPIRED_TOKEN' });
  const results = await Promise.allSettled([
    consumeEmailToken({ token: raw, purpose: 'email_verification' }),
    consumeEmailToken({ token: raw, purpose: 'email_verification' }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert(record.expiresAt > new Date());

  const expiredRaw = generateOpaqueToken();
  await EmailToken.create({ user: customer._id, purpose: 'password_reset', tokenHash: hashToken(expiredRaw), expiresAt: new Date(Date.now() - 60_000) });
  await assert.rejects(consumeEmailToken({ token: expiredRaw, purpose: 'password_reset' }), { code: 'INVALID_OR_EXPIRED_TOKEN' });
});

test('rate limiter blocks after configured limit', async () => {
  const limited = express();
  limited.post('/limited', createAuthRateLimiter(2, 60_000), (_req, res) => res.sendStatus(204));
  const testServer = limited.listen(0);
  try {
    const url = `http://127.0.0.1:${testServer.address().port}/limited`;
    assert.equal((await fetch(url, { method: 'POST' })).status, 204);
    assert.equal((await fetch(url, { method: 'POST' })).status, 204);
    const response = await fetch(url, { method: 'POST' });
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error.code, 'RATE_LIMITED');
  } finally {
    await new Promise((resolve, reject) => testServer.close((error) => error ? reject(error) : resolve()));
  }
});

test('cookies have audience paths and safe attributes; cookie mutations enforce Origin', async () => {
  const customerCookie = getRefreshCookieOptions('customer');
  const adminCookie = getRefreshCookieOptions('admin');
  assert.equal(customerCookie.path, '/api/v1/auth');
  assert.equal(adminCookie.path, '/api/v1/admin/auth');
  assert.equal(customerCookie.httpOnly, true);
  assert.equal(customerCookie.secure, false);
  assert.equal(customerCookie.sameSite, 'lax');
  assert(customerCookie.maxAge > 0);
  assert.equal((await fetch(`${baseUrl}/auth/refresh`, { method: 'POST' })).status, 403);
  assert.equal((await fetch(`${baseUrl}/auth/refresh`, { method: 'POST', headers: { Origin: 'https://attacker.example' } })).status, 403);
  const response = await fetch(`${baseUrl}/auth/refresh`, { method: 'POST', headers: { Origin: env.corsOrigin[0] } });
  assert.equal(response.status, 401);
});

test('query strings and raw internal errors are not reflected or logged', async () => {
  const missing = await fetch(`${baseUrl}/not-a-route?token=private-query-token`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.text()).includes('private-query-token'), false);

  const failing = express();
  failing.get('/', (_req, _res, next) => next(Object.assign(new Error('private-error-secret'), { status: 500 })));
  failing.use(errorHandler);
  const errorServer = failing.listen(0);
  const oldConsoleError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.map(String).join(' '));
  try {
    const response = await fetch(`http://127.0.0.1:${errorServer.address().port}/?token=private-query-token`);
    assert.equal(response.status, 500);
    assert.equal((await response.text()).includes('private-error-secret'), false);
    assert.equal(logs.join(' ').includes('private-error-secret'), false);
    assert.equal(logs.join(' ').includes('private-query-token'), false);
  } finally {
    console.error = oldConsoleError;
    await new Promise((resolve, reject) => errorServer.close((error) => error ? reject(error) : resolve()));
  }
});

test('auth schemas reject bad body fields and registration input is validated', async () => {
  let response = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'A', email: 'bad', password: 'weak' }),
  });
  assert.equal(response.status, 400);
  response = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', email: 'new@example.test', password: 'GoodPassword123!', role: 'admin' }),
  });
  assert.equal(response.status, 400);
  response = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', email: routeRegistrationEmail, password: 'GoodPassword123!' }),
  });
  assert.equal(response.status, 201);
  response = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x'.repeat(20_000), email: 'large@example.test', password: 'GoodPassword123!' }),
  });
  assert.equal(response.status, 413);
  const validBody = JSON.stringify({ name: 'A', email: routeRegistrationEmail, password: 'GoodPassword123!' });
  await fetch(`${baseUrl}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: validBody });
  await fetch(`${baseUrl}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: validBody });
  response = await fetch(`${baseUrl}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: validBody });
  assert.equal(response.status, 429);
});

test('MongoDB has unique token/user indexes and TTL indexes; health remains available', async () => {
  const emailIndexes = await EmailToken.collection.indexes();
  const sessionIndexes = await RefreshSession.collection.indexes();
  const userIndexes = await User.collection.indexes();
  assert(userIndexes.some((index) => index.key.email === 1 && index.unique));
  assert(emailIndexes.some((index) => index.key.tokenHash === 1 && index.unique));
  assert(emailIndexes.some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
  assert(sessionIndexes.some((index) => index.key.tokenHash === 1 && index.unique));
  assert(sessionIndexes.some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
});
