import { Router } from 'express';
import { AuditLog, Campus } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import sharedClient from '../services/shared-client.js';

const router = Router();

// POST /api/auth/login - Login via Shared API
router.post('/login', async (req, res) => {
  try {
    const { email, username, rollno, roll_no, identifier, password } = req.body;
    const rawIdentifier = [identifier, email, username, rollno, roll_no]
      .find((value) => typeof value === 'string' && value.trim().length > 0);
    const loginIdentifier = rawIdentifier ? rawIdentifier.trim() : '';

    if (!loginIdentifier || !password) {
      return res.status(400).json({ error: 'Email/username/rollno and password are required' });
    }

    const credentials = { password };
    if (loginIdentifier.includes('@')) credentials.email = loginIdentifier;
    else credentials.username = loginIdentifier;

    const result = await sharedClient.login(credentials);

    // Only allow admin/staff roles to log into CRM
    const allowedTypes = ['super_admin', 'campus_admin', 'staff', 'branch_staff'];
    if (!allowedTypes.includes(result.user.person_type)) {
      return res.status(403).json({ error: 'Access denied. Only admin and staff can access CRM.' });
    }

    // Map person_type to CRM role for frontend compatibility
    const roleMap = {
      super_admin: 'super_admin',
      campus_admin: 'admin',
      staff: 'staff',
      branch_staff: 'staff',
    };

    const userData = {
      ...result.user,
      role: roleMap[result.user.person_type] || 'staff',
    };

    // Shared API campuses don't store campus_type, so enrich from CRM cache.
    const campusId = result.user?.campus_id;
    if (campusId) {
      const cachedCampus = await Campus.findByPk(campusId, {
        attributes: ['id', 'name', 'campus_type'],
      });
      if (cachedCampus) {
        userData.campus_type = cachedCampus.campus_type;
        userData.campus = {
          ...(result.user.campus || {}),
          id: cachedCampus.id,
          name: result.user?.campus?.name || cachedCampus.name,
          campus_type: cachedCampus.campus_type,
        };
      }
    }

    await AuditLog.create({
      user_id: result.user.id,
      action: 'user.login',
      entity_type: 'user',
      entity_id: result.user.id,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    }).catch(() => {});

    res.json({ token: result.token, user: userData });
  } catch (error) {
    if (error.status === 401) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/change-password - Proxy to Shared API
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const SHARED_API = process.env.SHARED_API_URL || 'http://localhost:5002';
    const response = await fetch(`${SHARED_API}/api/v1/auth/change-password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    await AuditLog.create({
      user_id: req.user.id,
      action: 'user.change_password',
      entity_type: 'user',
      entity_id: req.user.id,
    }).catch(() => {});

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
