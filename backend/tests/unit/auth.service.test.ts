import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Mock dependencies before importing the module under test
// vi.hoisted() ensures these are available when vi.mock() factories run
// ---------------------------------------------------------------------------
const {
  mockUserFindOne,
  mockUserFindById,
  mockUserUpdateOne,
  mockUserSave,
  mockUserConstructor,
} = vi.hoisted(() => ({
  mockUserFindOne: vi.fn(),
  mockUserFindById: vi.fn(),
  mockUserUpdateOne: vi.fn(),
  mockUserSave: vi.fn(),
  mockUserConstructor: vi.fn(),
}));

vi.mock('../../src/models/User.js', () => {
  const UserModel = function (this: Record<string, unknown>, data: Record<string, unknown>) {
    mockUserConstructor(data);
    Object.assign(this, data);
    this.save = mockUserSave;
    this._id = data._id ?? 'mock-user-id';
    this.uid = data.uid ?? 'abcdef1234567890abcdef12';
    this.toSafeObject = () => ({
      _id: this._id,
      uid: this.uid,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
    });
    return this;
  };

  UserModel.findOne = mockUserFindOne;
  UserModel.findById = mockUserFindById;
  UserModel.updateOne = mockUserUpdateOne;

  return { User: UserModel };
});

vi.mock('../../src/services/email.service.js', () => ({
  emailService: {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-at-least-32-chars-long-for-testing',
    JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-at-least-32-chars-for-testing',
    JWT_ACCESS_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '7d',
  },
}));

vi.mock('../../src/config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

// Import after mocks are set up
import * as authService from '../../src/services/auth.service.js';
import { emailService } from '../../src/services/email.service.js';
import { AppError } from '../../src/utils/errors.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('auth.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // register
  // -------------------------------------------------------------------------
  describe('register', () => {
    it('creates a new user and sends verification email', async () => {
      mockUserFindOne.mockResolvedValueOnce(null); // No existing user
      mockUserSave.mockResolvedValueOnce(undefined);

      const result = await authService.register(
        'test@example.com',
        'Password123!',
        'John',
        'Doe'
      );

      expect(mockUserFindOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(mockUserConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
        })
      );
      expect(mockUserSave).toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String)
      );
      expect(result.user).toBeDefined();
    });

    it('normalizes email to lowercase', async () => {
      mockUserFindOne.mockResolvedValueOnce(null);
      mockUserSave.mockResolvedValueOnce(undefined);

      await authService.register('Test@EXAMPLE.com', 'Password123!', 'John', 'Doe');

      expect(mockUserFindOne).toHaveBeenCalledWith({ email: 'test@example.com' });
    });

    it('throws conflict error when email already exists', async () => {
      mockUserFindOne.mockResolvedValueOnce({ email: 'test@example.com' });

      const promise = authService.register('test@example.com', 'Password123!', 'John', 'Doe');

      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_EXISTS' });
    });
  });

  // -------------------------------------------------------------------------
  // verifyEmail
  // -------------------------------------------------------------------------
  describe('verifyEmail', () => {
    it('verifies a valid token and clears verification fields', async () => {
      const mockUser = {
        _id: 'user-1',
        emailVerified: false,
        emailVerificationToken: 'valid-token',
        emailVerificationExpiry: new Date(Date.now() + 86400000),
        save: vi.fn().mockResolvedValue(undefined),
      };

      mockUserFindOne.mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce(mockUser),
      });

      await authService.verifyEmail('valid-token');

      expect(mockUser.emailVerified).toBe(true);
      expect(mockUser.emailVerificationToken).toBeNull();
      expect(mockUser.emailVerificationExpiry).toBeNull();
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('throws bad request for invalid or expired token', async () => {
      mockUserFindOne.mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce(null),
      });

      await expect(authService.verifyEmail('bad-token')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_TOKEN',
      });
    });
  });

  // -------------------------------------------------------------------------
  // login
  // -------------------------------------------------------------------------
  describe('login', () => {
    function createMockLoginUser(overrides: Record<string, unknown> = {}) {
      return {
        _id: 'user-1',
        email: 'test@example.com',
        emailVerified: true,
        passwordHash: 'hashed',
        refreshTokens: [],
        verifyPassword: vi.fn().mockResolvedValue(true),
        toSafeObject: () => ({ _id: 'user-1', email: 'test@example.com' }),
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
      };
    }

    it('returns access and refresh tokens on valid credentials', async () => {
      const mockUser = createMockLoginUser();
      mockUserFindOne.mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce(mockUser),
      });

      const result = await authService.login('test@example.com', 'password');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(mockUser.verifyPassword).toHaveBeenCalledWith('password');
    });

    it('throws unauthorized for non-existent user', async () => {
      mockUserFindOne.mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce(null),
      });

      await expect(
        authService.login('nobody@example.com', 'password')
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });
    });

    it('throws unauthorized for unverified email', async () => {
      const mockUser = createMockLoginUser({ emailVerified: false });
      mockUserFindOne.mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce(mockUser),
      });

      await expect(
        authService.login('test@example.com', 'password')
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'EMAIL_NOT_VERIFIED',
      });
    });

    it('throws unauthorized for wrong password', async () => {
      const mockUser = createMockLoginUser();
      mockUser.verifyPassword.mockResolvedValueOnce(false);
      mockUserFindOne.mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce(mockUser),
      });

      await expect(
        authService.login('test@example.com', 'wrong')
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
      });
    });
  });

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------
  describe('logout', () => {
    it('removes the hashed refresh token from the user document', async () => {
      mockUserUpdateOne.mockResolvedValueOnce({ modifiedCount: 1 });

      await authService.logout('user-1', 'some-refresh-token');

      expect(mockUserUpdateOne).toHaveBeenCalledWith(
        { _id: 'user-1' },
        { $pull: { refreshTokens: { token: expect.any(String) } } }
      );
    });
  });

  // -------------------------------------------------------------------------
  // requestPasswordReset
  // -------------------------------------------------------------------------
  describe('requestPasswordReset', () => {
    it('generates reset token and sends email for existing verified user', async () => {
      const mockUser = {
        _id: 'user-1',
        email: 'test@example.com',
        emailVerified: true,
        passwordResetToken: null,
        passwordResetExpiry: null,
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockUserFindOne.mockResolvedValueOnce(mockUser);

      await authService.requestPasswordReset('test@example.com');

      expect(mockUser.passwordResetToken).toBeDefined();
      expect(mockUser.passwordResetExpiry).toBeInstanceOf(Date);
      expect(mockUser.save).toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String)
      );
    });

    it('does not throw for unknown email (prevents enumeration)', async () => {
      mockUserFindOne.mockResolvedValueOnce(null);

      // Should not throw
      await authService.requestPasswordReset('unknown@example.com');

      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // resetPassword
  // -------------------------------------------------------------------------
  describe('resetPassword', () => {
    it('resets password, clears token, and revokes all refresh tokens', async () => {
      const mockUser = {
        _id: 'user-1',
        passwordHash: 'old-hash',
        passwordResetToken: 'hashed-token',
        passwordResetExpiry: new Date(Date.now() + 3600000),
        refreshTokens: [{ token: 'a', expiresAt: new Date() }],
        save: vi.fn().mockResolvedValue(undefined),
      };
      mockUserFindOne.mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce(mockUser),
      });

      await authService.resetPassword('raw-token', 'NewPassword123!');

      expect(mockUser.passwordHash).toBe('NewPassword123!');
      expect(mockUser.passwordResetToken).toBeNull();
      expect(mockUser.passwordResetExpiry).toBeNull();
      expect(mockUser.refreshTokens).toEqual([]);
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('throws bad request for invalid token', async () => {
      mockUserFindOne.mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce(null),
      });

      await expect(
        authService.resetPassword('bad-token', 'NewPassword123!')
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_TOKEN',
      });
    });
  });

  // -------------------------------------------------------------------------
  // refreshAccessToken
  // -------------------------------------------------------------------------
  describe('refreshAccessToken', () => {
    it('rotates refresh token on valid refresh', async () => {
      // Create a real refresh token JWT for testing
      const refreshPayload = { userId: 'user-1', type: 'refresh' };
      const refreshToken = jwt.sign(
        refreshPayload,
        'test-jwt-refresh-secret-at-least-32-chars-for-testing',
        { expiresIn: '7d' }
      );

      const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');

      const mockUser = {
        _id: { toString: () => 'user-1' },
        email: 'test@example.com',
        refreshTokens: [
          { token: hashedToken, expiresAt: new Date(Date.now() + 7 * 86400000), createdAt: new Date() },
        ],
        toSafeObject: () => ({ _id: 'user-1' }),
        save: vi.fn().mockResolvedValue(undefined),
      };

      mockUserFindById.mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce(mockUser),
      });

      const result = await authService.refreshAccessToken(refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      // Old token should be removed and new one added
      expect(mockUser.save).toHaveBeenCalled();
    });

    it('throws unauthorized for invalid JWT', async () => {
      await expect(
        authService.refreshAccessToken('not-a-jwt')
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_REFRESH_TOKEN',
      });
    });
  });
});
