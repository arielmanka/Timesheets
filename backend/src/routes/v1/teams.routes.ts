import { Router } from 'express';
import * as teamsController from '../../controllers/teams.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireTeamMember, requireManager } from '../../middleware/accessControl.js';

const router = Router();

// All team routes require authentication
router.use(authenticate);

// Team-level routes (no team context needed)
router.post('/', teamsController.create);
router.get('/', teamsController.listMine);

// Routes that require team membership
router.get('/:teamId', requireTeamMember, teamsController.getOne);
router.delete('/:teamId', requireManager, teamsController.deleteTeam);

// User search within team context
router.get('/:teamId/search-user', requireTeamMember, teamsController.searchUser);

// Member management — managers only
router.post('/:teamId/members', requireManager, teamsController.addMember);
router.delete('/:teamId/members/:userId', requireManager, teamsController.removeMember);
router.patch('/:teamId/members/:userId/role', requireManager, teamsController.setRole);
router.patch('/:teamId/members/:userId/rate', requireManager, teamsController.setMemberRate);

export { router as teamsRouter };
