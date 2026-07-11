// packages/server/src/routes/reports.js
import express from 'express';
import Report from '../models/Report.js';
import {authMiddleware} from '../middleware/auth.js';

const router = express.Router();

router.post('/reports', authMiddleware, async (req, res, next) => {
  try {
    const { target, targetType, reason, detail, community } = req.body;

    if (!target || !targetType || !reason || !community) {
      return res.status(400).json({ data: null, error: 'Missing required fields', meta: null });
    }
    if (!['post', 'comment'].includes(targetType)) {
      return res.status(400).json({ data: null, error: 'Invalid targetType', meta: null });
    }

    const report = await Report.create({
      reporter: req.user.id,
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