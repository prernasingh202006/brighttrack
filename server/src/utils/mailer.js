// Sends email. Providers (chosen in config/env.js):
//   brevo   - real emails through Brevo's HTTPS API (no extra npm package; free plan = 300/day)
//   console - prints the message in the server terminal (local testing only, never in production)
//   memory  - keeps messages in an array (automated tests)
//   none    - nothing configured: sign-ups are refused with a clear error
const env = require('../config/env');
const logger = require('./logger');
const ApiError = require('./ApiError');

const outbox = []; // memory provider only

const SEND_FAILED = 'We could not send the verification email. Check the address and try again in a minute.';

async function sendMail({ to, subject, text, html, meta }) {
  const { provider, brevoKey, fromEmail, fromName } = env.mail;

  if (provider === 'memory') {
    outbox.push({ to, subject, text, meta });
    return;
  }

  if (provider === 'console') {
    console.log(`\n==================== EMAIL (console mode, not really sent) ====================\nTo: ${to}\nSubject: ${subject}\n\n${text}\n===============================================================================\n`);
    return;
  }

  if (provider === 'brevo') {
    let res;
    try {
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { name: fromName, email: fromEmail }, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      logger.error({ err }, 'email provider unreachable');
      throw new ApiError(502, SEND_FAILED, { code: 'EMAIL_SEND_FAILED' });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error({ status: res.status, body: body.slice(0, 300) }, 'email provider rejected the message');
      throw new ApiError(502, SEND_FAILED, { code: 'EMAIL_SEND_FAILED' });
    }
    return;
  }

  throw new ApiError(503, 'Email sending is not set up on this server yet, so new accounts cannot be created. Please contact the administrator.', {
    code: 'EMAIL_NOT_CONFIGURED',
  });
}

const isConfigured = () => env.mail.provider !== 'none';

async function sendVerificationCode({ to, name, code, minutes }) {
  const first = String(name || '').split(' ')[0] || 'there';
  const text = `Hi ${first},\n\nYour BrightTrack verification code is ${code}\n\nIt expires in ${minutes} minutes. If you did not create a BrightTrack account, you can ignore this email.\n`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:460px"><p>Hi ${first},</p><p>Your BrightTrack verification code is</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:12px 0">${code}</p><p>It expires in ${minutes} minutes. If you did not create a BrightTrack account, you can ignore this email.</p></div>`;
  await sendMail({ to, subject: `${code} is your BrightTrack verification code`, text, html, meta: { code } });
}

module.exports = { sendMail, sendVerificationCode, isConfigured, outbox };
