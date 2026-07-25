import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ data: null, error: 'No token provided.', meta: null });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { ...payload, _id: payload.userId };

    // Check if user has been banned since the token was issued
    const user = await User.findById(payload.userId).select('isBanned').lean();
    if (!user || user.isBanned) {
      return res.status(403).json({ data: null, error: 'This account has been suspended.', meta: null });
    }

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(401).json({ data: null, error: 'Invalid or expired token.', meta: null });
  }
};