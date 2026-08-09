import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { User, type IUser } from '../models/User.js';
import { emailService } from './email.service.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Token payload types
// ---------------------------------------------------------------------------
interface AccessTokenPayload {
  userId: string;
  email: string;
  type: 'access';
}

interface RefreshTokenPayload {
  userId: string;
  type: 'refresh';
}

// ---------------------------------------------------------------------------
// Registration (UA-2, UA-3, TECH-16)
// ---------------------------------------------------------------------------
export async function register(
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<{ user: Record<string, unknown> }> {
  // Check for existing user
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw AppError.conflict('A user with this email already exists', 'EMAIL_EXISTS');
  }

  // Generate email verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Create user — passwordHash is set to plaintext here, pre-save hook will hash it
  const user = new User({
    email: email.toLowerCase(),
    passwordHash: password,
    firstName,
    lastName,
    emailVerificationToken: verificationToken,
    emailVerificationExpiry: verificationExpiry,
  });

  await user.save();

  // Send verification email (or log to console)
  await emailService.sendVerificationEmail(email, verificationToken);

  logger.info({ userId: user._id, uid: user.uid }, 'User registered');

  return { user: user.toSafeObject() };
}

// ---------------------------------------------------------------------------
// Email verification (UA-2) — simple token-in-URL
// ---------------------------------------------------------------------------
export async function verifyEmail(token: string): Promise<void> {
  const user = await User.findOne({
    emailVerificationToken: token,
    emailVerificationExpiry: { $gt: new Date() },
  }).select('+emailVerificationToken +emailVerificationExpiry');

  if (!user) {
    throw AppError.badRequest('Invalid or expired verification token', 'INVALID_TOKEN');
  }

  user.emailVerified = true;
  user.emailVerificationToken = null;
  user.emailVerificationExpiry = null;
  await user.save();

  logger.info({ userId: user._id }, 'Email verified');
}

// ---------------------------------------------------------------------------
// Login (TECH-6, TECH-7)
// ---------------------------------------------------------------------------
export async function login(
  email: string,
  password: string
): Promise<{ accessToken: string; refreshToken: string; user: Record<string, unknown> }> {
  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+passwordHash +refreshTokens');

  if (!user) {
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (!user.emailVerified) {
    throw AppError.unauthorized('Email not verified. Check your inbox.', 'EMAIL_NOT_VERIFIED');
  }

  const passwordValid = await user.verifyPassword(password);
  if (!passwordValid) {
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user);

  logger.info({ userId: user._id }, 'User logged in');

  return {
    accessToken,
    refreshToken,
    user: user.toSafeObject(),
  };
}

// ---------------------------------------------------------------------------
// Refresh token (TECH-7)
// ---------------------------------------------------------------------------
export async function refreshAccessToken(
  refreshTokenValue: string
): Promise<{ accessToken: string; refreshToken: string }> {
  // Verify the refresh token JWT
  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(refreshTokenValue, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  } catch {
    throw AppError.unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  if (payload.type !== 'refresh') {
    throw AppError.unauthorized('Invalid token type', 'INVALID_TOKEN_TYPE');
  }

  // Find user and check the refresh token exists and is not expired
  const user = await User.findById(payload.userId).select('+refreshTokens +passwordHash');
  if (!user) {
    throw AppError.unauthorized('User not found', 'USER_NOT_FOUND');
  }

  const hashedIncoming = hashToken(refreshTokenValue);
  const storedToken = user.refreshTokens.find(
    (rt) => rt.token === hashedIncoming && rt.expiresAt > new Date()
  );

  if (!storedToken) {
    throw AppError.unauthorized('Refresh token expired or revoked', 'REFRESH_TOKEN_INVALID');
  }

  // Remove old token, issue new pair (rotation)
  user.refreshTokens = user.refreshTokens.filter((rt) => rt.token !== hashedIncoming);
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = await generateRefreshToken(user);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

// ---------------------------------------------------------------------------
// Logout — revoke specific refresh token (TECH-7)
// ---------------------------------------------------------------------------
export async function logout(userId: string, refreshTokenValue: string): Promise<void> {
  const hashedToken = hashToken(refreshTokenValue);

  await User.updateOne(
    { _id: userId },
    { $pull: { refreshTokens: { token: hashedToken } } }
  );

  logger.info({ userId }, 'User logged out');
}

// ---------------------------------------------------------------------------
// Password reset request (UA-17)
// ---------------------------------------------------------------------------
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase(), emailVerified: true });

  // Always return success to prevent email enumeration
  if (!user) {
    logger.warn({ email }, 'Password reset requested for unknown/unverified email');
    return;
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  user.passwordResetToken = hashToken(resetToken);
  user.passwordResetExpiry = resetExpiry;
  await user.save();

  await emailService.sendPasswordResetEmail(email, resetToken);

  logger.info({ userId: user._id }, 'Password reset requested');
}

// ---------------------------------------------------------------------------
// Password reset confirm (UA-17)
// ---------------------------------------------------------------------------
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const hashedToken = hashToken(token);

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpiry: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpiry +refreshTokens');

  if (!user) {
    throw AppError.badRequest('Invalid or expired reset token', 'INVALID_TOKEN');
  }

  // Update password — pre-save hook will hash it
  user.passwordHash = newPassword;
  user.passwordResetToken = null;
  user.passwordResetExpiry = null;

  // Revoke all refresh tokens on password change
  user.refreshTokens = [];

  await user.save();

  logger.info({ userId: user._id }, 'Password reset completed');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function generateAccessToken(user: IUser): string {
  const payload: AccessTokenPayload = {
    userId: user._id.toString(),
    email: user.email,
    type: 'access',
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRY } as SignOptions);
}

async function generateRefreshToken(user: IUser): Promise<string> {
  const payload: RefreshTokenPayload = {
    userId: user._id.toString(),
    type: 'refresh',
  };

  const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRY } as SignOptions);

  // Store hashed version in the database
  const hashedToken = hashToken(token);
  const expiresAt = new Date(Date.now() + parseDuration(env.JWT_REFRESH_EXPIRY));

  // Clean up expired tokens while adding the new one
  user.refreshTokens = user.refreshTokens.filter((rt) => rt.expiresAt > new Date());
  user.refreshTokens.push({ token: hashedToken, expiresAt, createdAt: new Date() });
  await user.save();

  return token;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Parse a duration string like "7d", "15m", "1h" into milliseconds.
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default:  return 7 * 24 * 60 * 60 * 1000;
  }
}
