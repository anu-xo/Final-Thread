// packages/server/src/routes/reports.js
import express from 'express';
import Report from '../models/Report.js';
import {authMiddleware} from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

/**
 * @openapi
 * /reports:
 *   post:
 *     tags: [Moderation]
 *     summary: Submit a content report
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [target, targetType, reason, community]
 *             properties:
 *               target:
 *                 type: string
 *                 description: Post or comment ID
 *               targetType:
 *                 type: string
 *                 enum: [post, comment]
 *               reason:
 *                 type: string
 *               detail:
 *                 type: string
 *                 maxLength: 1000
 *               community:
 *                 type: string
 *                 description: Community ID
 *     responses:
 *       201:
 *         description: Report submitted
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Envelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Report'
 *       400:
 *         description: Missing required fields or invalid targetType
 *       401:
 *         description: Not authenticated
 */
router.post('/reports', authMiddleware, writeLimiter, async (req, res, next) => {
  try {
    const { target, targetType, reason, detail, community } = req.body;

    if (!target || !targetType || !reason || !community) {
      return res.status(400).json({ data: null, error: 'Missing required fields', meta: null });
    }
    if (!['post', 'comment'].includes(targetType)) {
      return res.status(400).json({ data: null, error: 'Invalid targetType', meta: null });
    }

    const report = await Report.create({
      reporter: req.user._id,
      target,
      targetType,
      reason,
      detail,
      community,
      status: 'pending',
    });

    res.status(201).json({ data: report, error: null, meta: null });
  } catch (err) {
    next(err);
  }
});

export default router;