import jwt from 'jsonwebtoken';
import { User, Campus } from '../models/index.js';

const CRM_ALLOWED_ROLES = new Set(['super_admin', 'admin', 'staff']);

export const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] },
      include: [{ model: Campus, as: 'campus' }],
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (!user.is_active || user.deleted_at) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    if (!CRM_ALLOWED_ROLES.has(user.role)) {
      return res.status(403).json({
        error: 'Access denied. CRM portal is available only for super admin, campus admin, and staff.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    return res.status(500).json({ error: 'Server error' });
  }
};
