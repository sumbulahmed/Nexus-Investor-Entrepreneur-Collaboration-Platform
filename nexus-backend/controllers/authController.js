const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const User = require('../models/User');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateEmailToken,
  generateOTP,
} = require('../utils/tokenUtils');
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOTPEmail,
} = require('../utils/emailService');
const { sendSuccess, sendError } = require('../utils/response');

// ─── Register ─────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return sendError(res, 'Email already registered', 400);

    const emailVerifyToken = generateEmailToken();
    const emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      role,
      emailVerifyToken,
      emailVerifyExpiry,
    });

    await sendVerificationEmail(user, emailVerifyToken).catch(console.error);

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshTokens = [refreshToken];
    await user.save({ validateBeforeSave: false });

    return sendSuccess(
      res,
      { user: user.toPublicJSON(), accessToken, refreshToken },
      'Registration successful. Please verify your email.',
      201
    );
  } catch (err) {
    console.error(err);
    return sendError(res, err.message, 500);
  }
};

// ─── Login ────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password +twoFactorSecret +refreshTokens');
    if (!user || !(await user.matchPassword(password))) {
      return sendError(res, 'Invalid email or password', 401);
    }

    if (!user.isActive) return sendError(res, 'Account deactivated', 403);

    // If 2FA is enabled, issue a temporary token and require OTP
    if (user.twoFactorEnabled) {
      const otp = generateOTP();
      // Store OTP in user doc (expires 10 min)
      user.emailVerifyToken = crypto.createHash('sha256').update(otp).digest('hex');
      user.emailVerifyExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await user.save({ validateBeforeSave: false });
      await sendOTPEmail(user, otp).catch(console.error);
      return sendSuccess(res, { twoFactorRequired: true, userId: user._id }, 'OTP sent to your email');
    }

    user.lastLogin = new Date();
    const refreshToken = generateRefreshToken(user._id);
    user.refreshTokens = [...(user.refreshTokens || []).slice(-4), refreshToken]; // keep last 5
    await user.save({ validateBeforeSave: false });

    return sendSuccess(res, {
      user: user.toPublicJSON(),
      accessToken: generateAccessToken(user._id),
      refreshToken,
    }, 'Login successful');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Verify 2FA OTP ───────────────────────────────────────
exports.verify2FA = async (req, res) => {
  try {
    const { userId, otp } = req.body;
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

    const user = await User.findOne({
      _id: userId,
      emailVerifyToken: hashedOtp,
      emailVerifyExpiry: { $gt: Date.now() },
    }).select('+refreshTokens');

    if (!user) return sendError(res, 'Invalid or expired OTP', 400);

    user.emailVerifyToken = undefined;
    user.emailVerifyExpiry = undefined;
    user.lastLogin = new Date();
    const refreshToken = generateRefreshToken(user._id);
    user.refreshTokens = [...(user.refreshTokens || []).slice(-4), refreshToken];
    await user.save({ validateBeforeSave: false });

    return sendSuccess(res, {
      user: user.toPublicJSON(),
      accessToken: generateAccessToken(user._id),
      refreshToken,
    }, 'Login successful');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Verify email ─────────────────────────────────────────
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      emailVerifyToken: token,
      emailVerifyExpiry: { $gt: Date.now() },
    });

    if (!user) return sendError(res, 'Invalid or expired verification token', 400);

    user.isEmailVerified = true;
    user.emailVerifyToken = undefined;
    user.emailVerifyExpiry = undefined;
    await user.save({ validateBeforeSave: false });

    return sendSuccess(res, {}, 'Email verified successfully');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Refresh token ────────────────────────────────────────
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return sendError(res, 'Refresh token required', 401);

    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.id).select('+refreshTokens');

    if (!user || !user.refreshTokens?.includes(refreshToken)) {
      return sendError(res, 'Invalid refresh token', 401);
    }

    const newRefreshToken = generateRefreshToken(user._id);
    user.refreshTokens = user.refreshTokens
      .filter((t) => t !== refreshToken)
      .concat(newRefreshToken)
      .slice(-5);
    await user.save({ validateBeforeSave: false });

    return sendSuccess(res, {
      accessToken: generateAccessToken(user._id),
      refreshToken: newRefreshToken,
    }, 'Token refreshed');
  } catch (err) {
    return sendError(res, 'Invalid refresh token', 401);
  }
};

// ─── Logout ───────────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const user = await User.findById(req.user._id).select('+refreshTokens');
    if (user && refreshToken) {
      user.refreshTokens = (user.refreshTokens || []).filter((t) => t !== refreshToken);
      await user.save({ validateBeforeSave: false });
    }
    return sendSuccess(res, {}, 'Logged out successfully');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Forgot password ──────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    // Always return 200 to prevent email enumeration
    if (!user) return sendSuccess(res, {}, 'If that email exists, a reset link has been sent.');

    const token = generateEmailToken();
    user.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
    user.passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1hr
    await user.save({ validateBeforeSave: false });

    await sendPasswordResetEmail(user, token).catch(console.error);
    return sendSuccess(res, {}, 'If that email exists, a reset link has been sent.');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Reset password ───────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpiry: { $gt: Date.now() },
    }).select('+refreshTokens');

    if (!user) return sendError(res, 'Invalid or expired reset token', 400);

    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpiry = undefined;
    user.refreshTokens = []; // invalidate all sessions
    await user.save();

    return sendSuccess(res, {}, 'Password reset successful. Please log in again.');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Enable 2FA (TOTP setup) ──────────────────────────────
exports.setup2FA = async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({
      name: `BusinessNexus (${req.user.email})`,
      length: 20,
    });

    const user = await User.findById(req.user._id).select('+twoFactorSecret');
    user.twoFactorSecret = secret.base32;
    await user.save({ validateBeforeSave: false });

    const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);
    return sendSuccess(res, { secret: secret.base32, qrCode: qrDataUrl }, '2FA setup initiated');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.confirm2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+twoFactorSecret');
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: req.body.token,
      window: 1,
    });

    if (!verified) return sendError(res, 'Invalid TOTP token', 400);

    user.twoFactorEnabled = true;
    await user.save({ validateBeforeSave: false });
    return sendSuccess(res, {}, '2FA enabled successfully');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

exports.disable2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+twoFactorSecret +password');
    if (!(await user.matchPassword(req.body.password))) {
      return sendError(res, 'Incorrect password', 401);
    }
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    await user.save({ validateBeforeSave: false });
    return sendSuccess(res, {}, '2FA disabled');
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

// ─── Get current user ─────────────────────────────────────
exports.getMe = async (req, res) => {
  return sendSuccess(res, { user: req.user.toPublicJSON() });
};
