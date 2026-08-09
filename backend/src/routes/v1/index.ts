import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { usersRouter } from './users.routes.js';
import { teamsRouter } from './teams.routes.js';
import { cptRouter } from './cpt.routes.js';

const router = Router();

// Auth routes
router.use('/auth', authRouter);

// User routes
router.use('/users', usersRouter);

// Team routes
router.use('/teams', teamsRouter);

// Client, Project, Task routes (nested under /teams/:teamId/...)
router.use('/teams', cptRouter);

// API status
router.get('/status', (_req, res) => {
  res.json({ api: 'v1', status: 'operational' });
});

export { router as v1Router };

