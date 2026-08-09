import { Router } from 'express';
import * as authController from '../../controllers/auth.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { loginLimiter, registerLimiter, passwordResetLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

// Public routes — rate-limited (TECH-17)
router.post('/register', registerLimiter, authController.register);
router.post('/verify-email', authController.verifyEmail);
router.post('/login', loginLimiter, authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/password-reset/request', passwordResetLimiter, authController.requestPasswordReset);
router.post('/password-reset/confirm', authController.resetPassword);

// Authenticated routes
router.post('/logout', authenticate, authController.logout);

export { router as authRouter };
