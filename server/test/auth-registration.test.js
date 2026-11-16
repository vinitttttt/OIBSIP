import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { connectDatabase } from '../src/config/database.js';
import { authRateLimiters } from '../src/middleware/authRateLimit.js';
import { EmailToken } from '../src/models/EmailToken.js';
import { User } from '../src/models/User.js';
import { resendCustomerVerification } from '../src/services/authService.js';
import { setEmailSenderForTesting } from '../src/services/emailService.js';
import { comparePassword } from '../src/utils/passwords.js';
import { hashToken } from '../src/utils/tokens.js';

const runId = randomUUID();
const emailFor = (suffix) => `${suffix}-${runId}@example.test`;
const createdEmails = [];
const sentEmails = [];
let server;
let baseUrl;

before(async () => {
  await connectDatabase(env.mongoUri);
  await Promise.all([User.init(), EmailToken.init()]);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

beforeEach(() => {
  sentEmails.length = 0;
  for (const limiter of Object.values(authRateLimiters)) {
    limiter.resetKey('::ffff:127.0.0.1');
    limiter.resetKey('127.0.0.1');
  }
  setEmailSenderForTesting(async (message) => { sentEmails.push(message); });
});

after(async () => {
  const users = await User.find({ email: { $in: createdEmails } }).select('_id');
  const ids = users.map((user) => user._id);
  await EmailToken.deleteMany({ user: { $in: ids } });
  await User.deleteMany({ _id: { $in: ids } });
  setEmailSenderForTesting(undefined);
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await mongoose.disconnect();
});

async function register(email = emailFor('customer')) {
  createdEmails.push(email);
  return fetch(`${baseUrl}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Customer', email: `  ${email.toUpperCase()}  `, password: 'GoodPassword123!' }),
  });
}

function tokenFromLastEmail() {
  const match = /http:\/\/localhost:5173\/verify-email\?token=([A-Za-z0-9_-]+)/.exec(sentEmails.at(-1)?.text ?? '');
  assert(match, 'mock email should contain the frontend verification link');
  return match[1];
}

test('registration creates a safe, unverified customer and requests verification email', async () => {
  const email = emailFor('success');
  const response = await register(email);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.user.email, email);
  assert.equal(body.user.role, 'customer');
  assert.equal(body.user.emailVerifiedAt, null);
  assert.equal('passwordHash' in body.user, false);
  assert.equal(JSON.stringify(body).includes(tokenFromLastEmail()), false);
  const user = await User.findOne({ email }).select('+passwordHash');
  assert.equal(user.role, 'customer');
  assert.equal(user.emailVerifiedAt, null);
  assert.equal(user.passwordHash.includes('GoodPassword123!'), false);
  assert.equal(await comparePassword('GoodPassword123!', user.passwordHash), true);
  const token = tokenFromLastEmail();
  const record = await EmailToken.findOne({ user: user._id, purpose: 'email_verification' }).select('+tokenHash');
  assert(record);
  assert.equal(record.tokenHash, hashToken(token));
  assert.notEqual(record.tokenHash, token);
  assert.match(sentEmails[0].html, /PizzaHop/);
  assert.match(sentEmails[0].text, /expires in/);
});

test('registration rejects invalid and unknown input and safely handles duplicate email', async () => {
  const invalid = await fetch(`${baseUrl}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X', email: 'bad', password: 'weak' }) });
  assert.equal(invalid.status, 400);
  const extra = await fetch(`${baseUrl}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X', email: emailFor('admin-role'), password: 'GoodPassword123!', role: 'admin' }) });
  assert.equal(extra.status, 400);
  const email = emailFor('duplicate');
  assert.equal((await register(email)).status, 201);
  const duplicate = await register(email);
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, 'REGISTRATION_UNAVAILABLE');
});

test('verification succeeds once, rejects invalid/used tokens, and rolls back wrong-purpose consumption', async () => {
  const email = emailFor('verify');
  const registration = await register(email);
  const userId = (await registration.json()).user.id;
  const token = tokenFromLastEmail();
  let response = await fetch(`${baseUrl}/auth/verify-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  assert.equal(response.status, 200);
  assert((await User.findById(userId)).emailVerifiedAt);
  response = await fetch(`${baseUrl}/auth/verify-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  assert.equal(response.status, 400);

  const wrongPurpose = `R${'a'.repeat(42)}`;
  await EmailToken.create({ user: userId, purpose: 'password_reset', tokenHash: hashToken(wrongPurpose), expiresAt: new Date(Date.now() + 60_000) });
  response = await fetch(`${baseUrl}/auth/verify-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: wrongPurpose }) });
  assert.equal(response.status, 400);
  assert.equal((await EmailToken.findOne({ tokenHash: hashToken(wrongPurpose) })).usedAt, null);
  response = await fetch(`${baseUrl}/auth/verify-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'Z'.repeat(43) }) });
  assert.equal(response.status, 400);
});

test('expired tokens are rejected and only one concurrent verification succeeds', async () => {
  const email = emailFor('concurrent');
  const registration = await register(email);
  const { user } = await registration.json();
  const token = tokenFromLastEmail();
  const results = await Promise.all([token, token].map((value) => fetch(`${baseUrl}/auth/verify-email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: value }),
  })));
  assert.equal(results.filter((result) => result.status === 200).length, 1);
  assert.equal(results.filter((result) => result.status === 400).length, 1);

  const expiredToken = `E${'b'.repeat(42)}`;
  await EmailToken.create({ user: user.id, purpose: 'email_verification', tokenHash: hashToken(expiredToken), expiresAt: new Date(Date.now() - 1000) });
  const expiredResponse = await fetch(`${baseUrl}/auth/verify-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: expiredToken }) });
  assert.equal(expiredResponse.status, 400);
});

test('resend uses generic responses, respects cooldown, and recovers from provider failure', async () => {
  const email = emailFor('resend');
  await register(email);
  assert.equal(sentEmails.length, 1);
  const present = await fetch(`${baseUrl}/auth/resend-verification`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  const missing = await fetch(`${baseUrl}/auth/resend-verification`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailFor('missing') }) });
  assert.equal(present.status, 200);
  assert.equal(missing.status, 200);
  assert.equal((await present.json()).message, (await missing.json()).message);
  assert.equal(sentEmails.length, 1, 'cooldown suppresses immediate resend');

  const user = await User.findOne({ email });
  const result = await resendCustomerVerification(email, {
    now: new Date(Date.now() + env.emailVerificationResendCooldown + 1000),
    deliver: async () => { throw new Error('private provider details'); },
  });
  assert.match(result.message, /If an unverified customer account/);
  assert.equal(await EmailToken.countDocuments({ user: user._id, purpose: 'email_verification', usedAt: null }), 0);
  const retry = await resendCustomerVerification(email, {
    now: new Date(Date.now() + env.emailVerificationResendCooldown + 2000),
    deliver: async (message) => { sentEmails.push(message); },
  });
  assert.match(retry.message, /If an unverified customer account/);
  assert.equal(await EmailToken.countDocuments({ user: user._id, purpose: 'email_verification', usedAt: null }), 1);
});

test('registration provider failure is safe and leaves a resendable unverified account', async () => {
  const email = emailFor('mail-failure');
  createdEmails.push(email);
  setEmailSenderForTesting(async () => { throw new Error('private Resend response'); });
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Customer', email, password: 'GoodPassword123!' }),
  });
  assert.equal(response.status, 201);
  assert.equal((await response.text()).includes('private Resend response'), false);
  assert.equal((await User.findOne({ email })).emailVerifiedAt, null);
  const failedUser = await User.findOne({ email });
  assert.equal(await EmailToken.countDocuments({ user: failedUser._id, purpose: 'email_verification' }), 0);
  setEmailSenderForTesting(async (message) => { sentEmails.push(message); });
  const retry = await fetch(`${baseUrl}/auth/resend-verification`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  assert.equal(retry.status, 200);
  assert.equal(sentEmails.length, 1);
});
