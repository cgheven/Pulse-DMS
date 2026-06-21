import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Finding 8 fix: escape all user-controlled values before HTML interpolation
// to prevent HTML injection / phishing via crafted name or shop fields.
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendOTPEmail(
  to: string,
  otp: string,
  fullName: string
): Promise<{ error?: string }> {
  const firstName = escapeHtml(fullName.split(' ')[0] || fullName);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Pulse DMS Verification Code</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #080b10;
      color: #e2e8f0;
      padding: 40px 20px;
    }
    .wrapper {
      max-width: 560px;
      margin: 0 auto;
    }
    .card {
      background-color: #0f1117;
      border: 1px solid #1e2433;
      border-radius: 16px;
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #0f1117 0%, #1a1f2e 100%);
      border-bottom: 1px solid #1e2433;
      padding: 32px 40px 28px;
      text-align: center;
    }
    .logo-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 6px;
    }
    .logo-dot {
      width: 10px;
      height: 10px;
      background-color: #f59e0b;
      border-radius: 50%;
      display: inline-block;
    }
    .logo-text {
      font-size: 20px;
      font-weight: 700;
      color: #f8fafc;
      letter-spacing: -0.3px;
    }
    .logo-sub {
      font-size: 11px;
      color: #64748b;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .body {
      padding: 40px 40px 32px;
    }
    .greeting {
      font-size: 22px;
      font-weight: 600;
      color: #f8fafc;
      margin-bottom: 12px;
    }
    .intro {
      font-size: 15px;
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 36px;
    }
    .otp-label {
      font-size: 11px;
      font-weight: 600;
      color: #f59e0b;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    .otp-box {
      background-color: #13171f;
      border: 2px solid #f59e0b;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      margin-bottom: 28px;
    }
    .otp-code {
      font-family: 'Courier New', Courier, 'Lucida Console', monospace;
      font-size: 44px;
      font-weight: 700;
      color: #f59e0b;
      letter-spacing: 10px;
      text-indent: 10px;
    }
    .expiry-note {
      font-size: 13px;
      color: #64748b;
      text-align: center;
      margin-bottom: 32px;
    }
    .expiry-note strong {
      color: #f59e0b;
    }
    .divider {
      border: none;
      border-top: 1px solid #1e2433;
      margin-bottom: 28px;
    }
    .security-note {
      background-color: #13171f;
      border: 1px solid #1e2433;
      border-left: 3px solid #374151;
      border-radius: 8px;
      padding: 14px 16px;
      font-size: 13px;
      color: #64748b;
      line-height: 1.6;
    }
    .footer {
      background-color: #080b10;
      border-top: 1px solid #1e2433;
      padding: 24px 40px;
      text-align: center;
    }
    .footer-brand {
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 4px;
    }
    .footer-brand span {
      color: #f59e0b;
    }
    .footer-link {
      font-size: 12px;
      color: #334155;
      text-decoration: none;
    }
    .footer-link:hover {
      color: #f59e0b;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <!-- Header -->
      <div class="header">
        <div class="logo-row">
          <span class="logo-dot"></span>
          <span class="logo-text">Pulse DMS</span>
        </div>
        <div class="logo-sub">Dealer Management System</div>
      </div>

      <!-- Body -->
      <div class="body">
        <p class="greeting">Hi ${firstName},</p>
        <p class="intro">
          We received a request to verify your email address. Use the code below to complete your verification. This code is valid for a limited time.
        </p>

        <div class="otp-label">Your verification code</div>
        <div class="otp-box">
          <div class="otp-code">${otp}</div>
        </div>

        <p class="expiry-note">
          This code <strong>expires in 10 minutes</strong>. Do not share it with anyone.
        </p>

        <hr class="divider" />

        <div class="security-note">
          If you didn't request this verification code, you can safely ignore this email. Someone may have entered your email address by mistake.
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p class="footer-brand">
          <span>Pulse</span> DMS &mdash; Dealer Management System
        </p>
        <a href="https://yourpulse.io" class="footer-link">yourpulse.io</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  try {
    const { error } = await resend.emails.send({
      from: 'noreply@yourpulse.io',
      to,
      subject: 'Your Pulse DMS verification code',
      html,
    });

    if (error) {
      return { error: error.message };
    }

    return {};
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send verification email';
    return { error: message };
  }
}

export async function sendWelcomeEmail(
  to: string,
  fullName: string,
  shopName: string,
  trialEndsAt: Date
): Promise<{ error?: string }> {
  // rawFirstName is used only in plain-text contexts (e.g., email subject line)
  const rawFirstName = fullName.split(' ')[0] || fullName;
  // Escaped versions are used wherever values are interpolated into HTML
  const firstName = escapeHtml(rawFirstName);
  const safeShopName = escapeHtml(shopName);

  const formattedTrialDate = trialEndsAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Pulse DMS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #080b10;
      color: #e2e8f0;
      padding: 40px 20px;
    }
    .wrapper {
      max-width: 560px;
      margin: 0 auto;
    }
    .card {
      background-color: #0f1117;
      border: 1px solid #1e2433;
      border-radius: 16px;
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #0f1117 0%, #1a1f2e 100%);
      border-bottom: 1px solid #1e2433;
      padding: 32px 40px 28px;
      text-align: center;
    }
    .logo-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 6px;
    }
    .logo-dot {
      width: 10px;
      height: 10px;
      background-color: #f59e0b;
      border-radius: 50%;
      display: inline-block;
    }
    .logo-text {
      font-size: 20px;
      font-weight: 700;
      color: #f8fafc;
      letter-spacing: -0.3px;
    }
    .logo-sub {
      font-size: 11px;
      color: #64748b;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .hero-badge {
      display: inline-block;
      background-color: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #f59e0b;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 6px 14px;
      border-radius: 20px;
      margin-top: 20px;
    }
    .body {
      padding: 40px 40px 32px;
    }
    .greeting {
      font-size: 24px;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 8px;
    }
    .shop-name {
      font-size: 15px;
      color: #f59e0b;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .intro {
      font-size: 15px;
      color: #94a3b8;
      line-height: 1.65;
      margin-bottom: 32px;
    }
    .trial-box {
      background: linear-gradient(135deg, #13171f 0%, #1a1f2e 100%);
      border: 1px solid #1e2433;
      border-left: 3px solid #f59e0b;
      border-radius: 10px;
      padding: 20px 22px;
      margin-bottom: 32px;
    }
    .trial-label {
      font-size: 11px;
      font-weight: 600;
      color: #f59e0b;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .trial-date {
      font-size: 16px;
      font-weight: 600;
      color: #f8fafc;
    }
    .trial-note {
      font-size: 13px;
      color: #64748b;
      margin-top: 4px;
    }
    .features-title {
      font-size: 14px;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 16px;
      letter-spacing: 0.2px;
    }
    .features-list {
      list-style: none;
      margin-bottom: 36px;
    }
    .features-list li {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      font-size: 14px;
      color: #94a3b8;
      padding: 9px 0;
      border-bottom: 1px solid #13171f;
      line-height: 1.5;
    }
    .features-list li:last-child {
      border-bottom: none;
    }
    .feature-icon {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      background-color: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      margin-top: 1px;
    }
    .cta-center {
      text-align: center;
      margin-bottom: 8px;
    }
    .cta-button {
      display: inline-block;
      background-color: #f59e0b;
      color: #0f1117;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      padding: 14px 36px;
      border-radius: 10px;
      letter-spacing: 0.2px;
    }
    .cta-sub {
      text-align: center;
      font-size: 13px;
      color: #475569;
      margin-top: 12px;
    }
    .footer {
      background-color: #080b10;
      border-top: 1px solid #1e2433;
      padding: 24px 40px;
      text-align: center;
    }
    .footer-brand {
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 4px;
    }
    .footer-brand span {
      color: #f59e0b;
    }
    .footer-link {
      font-size: 12px;
      color: #334155;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <!-- Header -->
      <div class="header">
        <div class="logo-row">
          <span class="logo-dot"></span>
          <span class="logo-text">Pulse DMS</span>
        </div>
        <div class="logo-sub">Dealer Management System</div>
        <div class="hero-badge">Welcome aboard</div>
      </div>

      <!-- Body -->
      <div class="body">
        <p class="greeting">Welcome, ${firstName}!</p>
        <p class="shop-name">${safeShopName}</p>
        <p class="intro">
          Your account is live and ready to go. You're on a free trial — everything is unlocked so you can explore every feature at full capacity.
        </p>

        <!-- Trial info -->
        <div class="trial-box">
          <div class="trial-label">Your trial ends on</div>
          <div class="trial-date">${formattedTrialDate}</div>
          <div class="trial-note">Full access to all features until then &mdash; no credit card needed.</div>
        </div>

        <!-- Feature list -->
        <p class="features-title">Everything included in your trial:</p>
        <ul class="features-list">
          <li>
            <span class="feature-icon">&#9654;</span>
            <span><strong style="color:#cbd5e1;">Sales Tracking</strong> &mdash; Log every sale, track revenue, and monitor daily performance in real time.</span>
          </li>
          <li>
            <span class="feature-icon">&#9654;</span>
            <span><strong style="color:#cbd5e1;">Stock Management</strong> &mdash; Keep your inventory accurate with full vehicle and parts stock control.</span>
          </li>
          <li>
            <span class="feature-icon">&#9654;</span>
            <span><strong style="color:#cbd5e1;">Expense Management</strong> &mdash; Record and categorize business expenses to stay on top of outgoings.</span>
          </li>
          <li>
            <span class="feature-icon">&#9654;</span>
            <span><strong style="color:#cbd5e1;">P&amp;L Reports</strong> &mdash; Instantly generate profit &amp; loss statements for any date range.</span>
          </li>
          <li>
            <span class="feature-icon">&#9654;</span>
            <span><strong style="color:#cbd5e1;">Staff Management</strong> &mdash; Add team members, assign roles, and control access permissions.</span>
          </li>
        </ul>

        <!-- CTA -->
        <div class="cta-center">
          <a href="https://dms.yourpulse.io/dashboard" class="cta-button">Open Dashboard</a>
        </div>
        <p class="cta-sub">Or visit <a href="https://yourpulse.io" style="color:#f59e0b;text-decoration:none;">yourpulse.io</a></p>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p class="footer-brand">
          <span>Pulse</span> DMS &mdash; Dealer Management System
        </p>
        <a href="https://yourpulse.io" class="footer-link">yourpulse.io</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  try {
    const { error } = await resend.emails.send({
      from: 'noreply@yourpulse.io',
      to,
      subject: `Welcome to Pulse DMS, ${rawFirstName}! Your trial is active`,
      html,
    });

    if (error) {
      return { error: error.message };
    }

    return {};
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send welcome email';
    return { error: message };
  }
}

// Finding 2 fix: sanitize the resetLink before interpolating into HTML.
// escapeAttr validates the scheme (https-only) and encodes characters that
// break out of an HTML attribute. escapeHtml encodes the same characters for
// the text node (fallback-link paragraph). Both guards must be applied.
function escapeAttr(url: string): string {
  if (!url.startsWith("https://")) return "#invalid";
  return url
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string
): Promise<{ error?: string }> {
  const safeResetLinkAttr = escapeAttr(resetLink);
  const safeResetLinkText = escapeHtml(resetLink);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your Pulse DMS password</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #080b10;
      color: #e2e8f0;
      padding: 40px 20px;
    }
    .wrapper { max-width: 560px; margin: 0 auto; }
    .card {
      background-color: #0f1117;
      border: 1px solid #1e2433;
      border-radius: 16px;
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #0f1117 0%, #1a1f2e 100%);
      border-bottom: 1px solid #1e2433;
      padding: 32px 40px 28px;
      text-align: center;
    }
    .logo-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 6px;
    }
    .logo-dot {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      border-radius: 8px;
      display: inline-block;
    }
    .logo-text {
      font-size: 20px;
      font-weight: 700;
      color: #f1f5f9;
      letter-spacing: -0.3px;
    }
    .logo-sub {
      font-size: 12px;
      color: #475569;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .hero-badge {
      display: inline-block;
      margin-top: 16px;
      background: rgba(245,158,11,0.12);
      border: 1px solid rgba(245,158,11,0.25);
      color: #f59e0b;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      padding: 5px 14px;
      border-radius: 20px;
    }
    .body { padding: 36px 40px 32px; }
    .heading {
      font-size: 22px;
      font-weight: 700;
      color: #f1f5f9;
      margin-bottom: 12px;
    }
    .intro {
      font-size: 15px;
      color: #94a3b8;
      line-height: 1.7;
      margin-bottom: 28px;
    }
    .cta-center { text-align: center; margin-bottom: 24px; }
    .cta-button {
      display: inline-block;
      background-color: #f59e0b;
      color: #0f1117;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      padding: 14px 36px;
      border-radius: 10px;
      letter-spacing: 0.2px;
    }
    .expiry-note {
      font-size: 13px;
      color: #475569;
      text-align: center;
      margin-bottom: 28px;
    }
    .fallback-box {
      background-color: #0a0d14;
      border: 1px solid #1e2433;
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 28px;
    }
    .fallback-label {
      font-size: 11px;
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 8px;
    }
    .fallback-link {
      font-size: 12px;
      color: #334155;
      word-break: break-all;
      line-height: 1.5;
    }
    .security-note {
      font-size: 13px;
      color: #475569;
      line-height: 1.6;
    }
    .footer {
      background-color: #080b10;
      border-top: 1px solid #1e2433;
      padding: 24px 40px;
      text-align: center;
    }
    .footer-brand {
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 4px;
    }
    .footer-brand span { color: #f59e0b; }
    .footer-link { font-size: 12px; color: #334155; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo-row">
          <span class="logo-dot"></span>
          <span class="logo-text">Pulse DMS</span>
        </div>
        <div class="logo-sub">Dealer Management System</div>
        <div class="hero-badge">Password Reset</div>
      </div>

      <div class="body">
        <p class="heading">Reset your password</p>
        <p class="intro">
          We received a request to reset the password for your Pulse DMS account.
          Click the button below to choose a new password.
        </p>

        <div class="cta-center">
          <a href="${safeResetLinkAttr}" class="cta-button">Reset Password</a>
        </div>

        <p class="expiry-note">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>

        <div class="fallback-box">
          <p class="fallback-label">Button not working?</p>
          <p class="fallback-link">Copy and paste this link into your browser:<br />${safeResetLinkText}</p>
        </div>

        <p class="security-note">
          For your security, this link can only be used once. After resetting your password, you'll be signed out of all active sessions.
        </p>
      </div>

      <div class="footer">
        <p class="footer-brand"><span>Pulse</span> DMS &mdash; Dealer Management System</p>
        <a href="https://yourpulse.io" class="footer-link">yourpulse.io</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  try {
    const { error } = await resend.emails.send({
      from: 'noreply@yourpulse.io',
      to,
      subject: 'Reset your Pulse DMS password',
      html,
    });

    if (error) {
      return { error: error.message };
    }

    return {};
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send password reset email';
    return { error: message };
  }
}
