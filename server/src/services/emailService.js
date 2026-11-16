import { Resend } from 'resend';
import { env } from '../config/env.js';

let resend;
let testEmailSender;

export function setEmailSenderForTesting(sender) {
  testEmailSender = sender;
}

export async function sendTransactionalEmail({ to, subject, html, text }) {
  if (testEmailSender) return testEmailSender({ to, subject, html, text });
  if (!env.resendApiKey) throw new Error('Email provider is not configured');
  resend ??= new Resend(env.resendApiKey);
  const { error } = await resend.emails.send({ from: env.emailFrom, to, subject, html, text });
  if (error) throw new Error('Transactional email delivery failed');
}
