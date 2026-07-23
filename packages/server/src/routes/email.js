import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = Router();

router.get('/unsubscribe', async (req, res) => {
  const { token } = req.query;
  try {
    const payload = jwt.verify(token, process.env.JWT_UNSUB_SECRET);
    if (payload.purpose !== 'digest-unsub') throw new Error('invalid token purpose');
    await User.findByIdAndUpdate(payload.userId, { 'notifPrefs.digest': false });
    res.send('You have been unsubscribed from the weekly digest.');
  } catch (err) {
    res.status(400).send('Invalid or expired unsubscribe link.');
  }
});

export default router;
