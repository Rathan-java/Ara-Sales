'use strict';

/**
 * Email delivery via Gmail SMTP (Nodemailer).
 *
 * Config comes from .env (GMAIL_USER / GMAIL_APP_PASSWORD) via config.mail — no
 * hardcoded credentials. If either is missing we log a startup warning and fall
 * back to a no-op transport that logs the message instead of sending, so the
 * rest of the app keeps working in dev without email set up.
 */

const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;
let transportReady = false;

function init() {
  const { gmailUser, gmailAppPassword } = config.mail;
  if (!gmailUser || !gmailAppPassword) {
    // eslint-disable-next-line no-console
    console.warn(
      '[email] GMAIL_USER / GMAIL_APP_PASSWORD not set — password-reset emails '
      + 'will be logged to the console instead of sent. Set them in .env to enable Gmail SMTP.',
    );
    transportReady = false;
    return;
  }
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL
    auth: { user: gmailUser, pass: gmailAppPassword },
  });
  transportReady = true;
}

init();

/**
 * Send the 6-digit password-reset OTP.
 * @param {string} to recipient email
 * @param {string} otp the 6-digit code (plaintext, for the email body only)
 */
async function sendOtpEmail(to, otp) {
  const subject = 'Your Ara Sales verification code';
  const ttlMin = Math.round(config.otp.ttlSeconds / 60);
  const text =
    `Your Ara Sales verification code is ${otp}.\n\n`
    + `It expires in ${ttlMin} minutes. If you didn't request a password reset, you can ignore this email.`;
  const html =
    `<p>Your Ara Sales verification code is:</p>`
    + `<p style="font-size:28px;font-weight:bold;letter-spacing:4px">${otp}</p>`
    + `<p>It expires in <strong>${ttlMin} minutes</strong>. `
    + `If you didn't request a password reset, you can ignore this email.</p>`;

  if (!transportReady) {
    // Dev fallback: surface the code in the server log instead of sending.
    // eslint-disable-next-line no-console
    console.log(`[email:fallback] To: ${to} | ${subject} | code=${otp} (expires ${ttlMin}m)`);
    return { delivered: false, fallback: true };
  }

  const from = `"${config.mail.fromName}" <${config.mail.gmailUser}>`;
  await transporter.sendMail({ from, to, subject, text, html });
  return { delivered: true };
}

module.exports = { sendOtpEmail, isReady: () => transportReady };
