import jwt from 'jsonwebtoken';

export async function resolveViewerUserId(req) {
  if (req.user?._id || req.user?.id) {
    return String(req.user._id || req.user.id);
  }

  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.slice('Bearer '.length);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.userId ? String(payload.userId) : null;
  } catch {
    return null;
  }
}