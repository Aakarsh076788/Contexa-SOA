import { sessionAuth } from './auth.js';
export function adminAuth(req, res, next) {
  return sessionAuth(req, res, (error) => {
    if (error) return next(error);
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
    next();
  });
}
