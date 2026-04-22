import { Router } from 'express';
import { Op } from 'sequelize';
import { User, Campus, AuditLog } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { authorize, scopeToCampus } from '../middleware/authorize.js';
import sharedClient from '../services/shared-client.js';
import { incrementalSync } from '../services/sync.js';

const router = Router();
const VALID_CAMPUS_TYPES = ['school', 'college'];
const STAFF_ROLE_SCOPE = ['super_admin', 'admin', 'staff'];

function normalizeEmail(value) {
  if (value === undefined || value === null) return value;
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

router.use(authenticate);
router.use(authorize('super_admin', 'admin'));
router.use(scopeToCampus);

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const where = { deleted_at: null, ...req.campusScope };
    const campusType = req.user.role === 'super_admin' && VALID_CAMPUS_TYPES.includes(req.query.campus_type)
      ? req.query.campus_type
      : null;

    if (req.query.role) {
      const roleQuery = String(req.query.role)
        .split(',')
        .map(r => r.trim())
        .filter(Boolean);
      where.role = roleQuery.length > 1 ? { [Op.in]: roleQuery } : roleQuery[0];
    }
    if (req.query.is_active !== undefined) {
      where.is_active = req.query.is_active === 'true';
    }

    const users = await User.findAll({
      where,
      attributes: { exclude: ['password'] },
      include: [{
        model: Campus,
        as: 'campus',
        required: !!campusType,
        ...(campusType ? { where: { campus_type: campusType, deleted_at: null, is_active: true } } : {}),
      }],
      order: [['name', 'ASC']],
    });

    res.json(users);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/staff/available
router.get('/staff/available', async (req, res) => {
  try {
    const where = {
      deleted_at: null,
      is_active: true,
      role: { [Op.in]: STAFF_ROLE_SCOPE },
      ...req.campusScope,
    };
    const campusType = req.user.role === 'super_admin' && VALID_CAMPUS_TYPES.includes(req.query.campus_type)
      ? req.query.campus_type
      : null;

    if (req.query.campus_id && req.user.role === 'super_admin') {
      where.campus_id = req.query.campus_id;
    }

    const staff = await User.findAll({
      where,
      attributes: ['id', 'name', 'email', 'role', 'campus_id'],
      include: [{
        model: Campus,
        as: 'campus',
        attributes: ['id', 'name', 'campus_type'],
        required: !!campusType,
        ...(campusType ? { where: { campus_type: campusType, deleted_at: null, is_active: true } } : {}),
      }],
      order: [['name', 'ASC']],
    });

    res.json(staff);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findOne({
      where: { id: req.params.id, deleted_at: null },
      attributes: { exclude: ['password'] },
      include: [{ model: Campus, as: 'campus' }],
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (req.user.role === 'admin' && user.campus_id !== req.user.campus_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/users - Create user via Shared API
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, password, role, campus_id } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedRole = role === 'teacher' ? 'staff' : (role || 'staff');
    const isStudent = normalizedRole === 'student';

    if (!name || !normalizedEmail) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    if (!isStudent && !password) {
      return res.status(400).json({ error: 'Password is required for staff and admin users' });
    }

    if (normalizedRole === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can create super admin accounts' });
    }

    const assignedCampus = req.user.role === 'admin' ? req.user.campus_id : campus_id;

    // Map CRM role to shared person_type
    const typeMap = {
      super_admin: 'super_admin',
      admin: 'campus_admin',
      staff: 'staff',
      student: 'student',
    };

    // Create in Shared API (source of truth)
    const person = await sharedClient.createPerson({
      name,
      email: normalizedEmail,
      phone,
      ...((!isStudent && password) ? { password } : {}),
      person_type: typeMap[normalizedRole] || 'staff',
      campus_id: assignedCampus,
    });

    // Sync cache to get the new user locally
    await incrementalSync();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'user.create',
      entity_type: 'user',
      entity_id: person.id,
      new_values: { name, email: normalizedEmail, role: normalizedRole, campus_id: assignedCampus },
    });

    res.status(201).json(person);
  } catch (error) {
    if (error.status === 409) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, deleted_at: null } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (req.user.role === 'admin' && user.campus_id !== req.user.campus_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (user.role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Cannot modify super admin account' });
    }

    const { name, email, phone, role, campus_id, is_active } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedRole = role === 'teacher' ? 'staff' : role;
    const oldValues = { name: user.name, email: user.email, role: user.role, is_active: user.is_active };

    if (normalizedEmail && normalizedEmail !== String(user.email || '').toLowerCase()) {
      const existing = await User.findOne({
        where: {
          id: { [Op.ne]: user.id },
          email: { [Op.iLike]: normalizedEmail },
          deleted_at: null,
        },
      });
      if (existing) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }

    await user.update({
      name: name || user.name,
      email: email !== undefined ? normalizedEmail : user.email,
      phone: phone !== undefined ? phone : user.phone,
      role: normalizedRole || user.role,
      campus_id: campus_id !== undefined ? campus_id : user.campus_id,
      is_active: is_active !== undefined ? is_active : user.is_active,
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'user.update',
      entity_type: 'user',
      entity_id: user.id,
      old_values: oldValues,
      new_values: { name: user.name, email: user.email, role: user.role, is_active: user.is_active },
    });

    const userData = user.toJSON();
    delete userData.password;
    res.json(userData);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/users/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, deleted_at: null } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'super_admin') {
      return res.status(403).json({ error: 'Cannot delete super admin account' });
    }

    if (req.user.role === 'admin' && user.campus_id !== req.user.campus_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await user.update({ deleted_at: new Date(), is_active: false });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'user.delete',
      entity_type: 'user',
      entity_id: user.id,
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
