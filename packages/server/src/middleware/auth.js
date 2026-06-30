// src/middleware/auth.js
export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { ...payload, _id: payload.userId };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};