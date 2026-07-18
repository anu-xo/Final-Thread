import { authMiddleware } from './auth.js';

export default function adminGuard(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Express router-level helper — applies authMiddleware + adminGuard
 * in one call.  Use as:
 *   import { adminRouter } from '../middleware/adminGuard.js';
 *   router.use(adminRouter);
 */
import { Router } from 'express';
export const adminRouter = Router();
adminRouter.use(authMiddleware);
adminRouter.use(adminGuard);
