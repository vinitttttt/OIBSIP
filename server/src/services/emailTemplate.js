function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function verificationEmail({ name, verificationUrl, expiryLabel }) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(verificationUrl);
  const safeExpiry = escapeHtml(expiryLabel);
  return {
    subject: 'Verify your PizzaHop email',
    text: `Hi ${name},\n\nThanks for joining PizzaHop! Verify your email using this link:\n${verificationUrl}\n\nThis link expires in ${expiryLabel}. If you did not create a PizzaHop account, you can ignore this email.\n\n— The PizzaHop team`,
    html: `<!doctype html><html><body style="margin:0;background:#fffaf3;font-family:Arial,sans-serif;color:#20251f"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border:1px solid #eee8dc;border-radius:12px"><p style="font-size:22px;font-weight:bold;color:#244d3d">🍕 PizzaHop</p><h1 style="font-size:25px">Verify your email</h1><p>Hi ${safeName},</p><p>Thanks for joining PizzaHop! Confirm your email address to finish creating your account.</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#244d3d;color:#fff;padding:14px 22px;border-radius:7px;text-decoration:none;font-weight:bold">Verify my email</a></p><p>If the button does not work, copy this link into your browser:<br><a href="${safeUrl}" style="color:#c54e30;word-break:break-all">${safeUrl}</a></p><p>This link expires in ${safeExpiry}. If you did not create a PizzaHop account, you can ignore this email.</p><p style="color:#777">— The PizzaHop team</p></main></body></html>`,
  };
}
