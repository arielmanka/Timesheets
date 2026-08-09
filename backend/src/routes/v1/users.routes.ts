import { Router } from 'express';
import * as usersController from '../../controllers/users.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();

// All user routes require authentication
router.use(authenticate);

router.get('/me', usersController.getProfile);
router.patch('/me', usersController.updateProfile);
router.delete('/me', usersController.requestDeletion);

export { router as usersRouter };
