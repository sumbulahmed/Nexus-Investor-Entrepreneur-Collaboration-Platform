const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ─── Base HTML template ───────────────────────────────────
const baseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px;
                 overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
    .header { background: #1a1a2e; padding: 32px 40px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; letter-spacing: 1px; }
    .header span { color: #7c5cbf; }
    .body { padding: 40px; color: #333; line-height: 1.7; }
    .btn { display: inline-block; margin: 24px 0; padding: 14px 32px;
           background: #7c5cbf; color: #fff; text-decoration: none;
           border-radius: 8px; font-weight: 600; }
    .otp { font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1a1a2e;
           text-align: center; padding: 24px; background: #f4f0ff; border-radius: 8px; margin: 24px 0; }
    .footer { background: #f9f9f9; padding: 20px 40px; font-size: 12px; color: #999; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>Business <span>Nexus</span></h1></div>
    <div class="body">${content}</div>
    <div class="footer">© ${new Date().getFullYear()} Business Nexus. All rights reserved.</div>
  </div>
</body>
</html>`;

// ─── Send helpers ─────────────────────────────────────────
const send = async (to, subject, html) => {
  await transporter.sendMail({
    from: `"${process.env.FROM_NAME || 'Business Nexus'}" <${process.env.FROM_EMAIL}>`,
    to,
    subject,
    html,
  });
};

const sendVerificationEmail = async (user, token) => {
  const url = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
  await send(
    user.email,
    'Verify your Nexus account',
    baseTemplate(`
      <p>Hi ${user.firstName},</p>
      <p>Welcome to <strong>Business Nexus</strong>! Please verify your email address to get started.</p>
      <a class="btn" href="${url}">Verify Email</a>
      <p>This link expires in 24 hours.</p>
    `)
  );
};

const sendPasswordResetEmail = async (user, token) => {
  const url = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  await send(
    user.email,
    'Reset your Nexus password',
    baseTemplate(`
      <p>Hi ${user.firstName},</p>
      <p>You requested a password reset. Click below to set a new password:</p>
      <a class="btn" href="${url}">Reset Password</a>
      <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
    `)
  );
};

const sendOTPEmail = async (user, otp) => {
  await send(
    user.email,
    'Your Nexus 2FA Code',
    baseTemplate(`
      <p>Hi ${user.firstName},</p>
      <p>Your one-time verification code is:</p>
      <div class="otp">${otp}</div>
      <p>This code expires in <strong>10 minutes</strong>. Never share it with anyone.</p>
    `)
  );
};

const sendMeetingRequestEmail = async (recipient, organizer, meeting) => {
  await send(
    recipient.email,
    `Meeting Request: ${meeting.title}`,
    baseTemplate(`
      <p>Hi ${recipient.firstName},</p>
      <p><strong>${organizer.firstName} ${organizer.lastName}</strong> has requested a meeting with you.</p>
      <p><strong>Title:</strong> ${meeting.title}</p>
      <p><strong>When:</strong> ${new Date(meeting.startTime).toLocaleString()}</p>
      <p><strong>Duration:</strong> ${meeting.duration} minutes</p>
      <p><strong>Type:</strong> ${meeting.type}</p>
      ${meeting.description ? `<p><strong>Description:</strong> ${meeting.description}</p>` : ''}
      <a class="btn" href="${process.env.CLIENT_URL}/meetings/${meeting._id}">View Meeting</a>
    `)
  );
};

const sendMeetingStatusEmail = async (recipient, meeting, status) => {
  const statusMsg = status === 'accepted' ? 'accepted ✅' : 'declined ❌';
  await send(
    recipient.email,
    `Meeting ${statusMsg}: ${meeting.title}`,
    baseTemplate(`
      <p>Hi ${recipient.firstName},</p>
      <p>Your meeting request <strong>"${meeting.title}"</strong> has been <strong>${statusMsg}</strong>.</p>
      ${status === 'accepted' ? `<a class="btn" href="${process.env.CLIENT_URL}/meetings/${meeting._id}">Join Meeting</a>` : ''}
    `)
  );
};

const sendPaymentConfirmationEmail = async (user, transaction) => {
  await send(
    user.email,
    `Payment ${transaction.status}: $${transaction.amount}`,
    baseTemplate(`
      <p>Hi ${user.firstName},</p>
      <p>Your payment of <strong>$${transaction.amount} ${transaction.currency}</strong> is <strong>${transaction.status}</strong>.</p>
      <p><strong>Transaction ID:</strong> ${transaction._id}</p>
      <p><strong>Date:</strong> ${new Date(transaction.createdAt).toLocaleString()}</p>
      <a class="btn" href="${process.env.CLIENT_URL}/payments">View Transactions</a>
    `)
  );
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOTPEmail,
  sendMeetingRequestEmail,
  sendMeetingStatusEmail,
  sendPaymentConfirmationEmail,
};
