import { Router } from 'express';
import { Campus, AuditLog } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';

const router = Router();

router.use(authenticate);

// GET /api/campuses
router.get('/', async (req, res) => {
  try {
    const where = { deleted_at: null };
    if (req.query.is_active !== undefined) {
      where.is_active = req.query.is_active === 'true';
    }

    const campuses = await Campus.findAll({
      where,
      order: [['name', 'ASC']],
    });

    res.json(campuses);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/campuses
router.post('/', authorize('super_admin'), async (req, res) => {
  try {
    const { name, address, phone, campus_type } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Campus name is required' });
    }

    const normalizedCampusType = campus_type || 'school';
    if (!['school', 'college'].includes(normalizedCampusType)) {
      return res.status(400).json({ error: 'Campus type must be either school or college' });
    }

    const campus = await Campus.create({
      name,
      address,
      phone,
      campus_type: normalizedCampusType,
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'campus.create',
      entity_type: 'campus',
      entity_id: campus.id,
      new_values: { name, address, phone, campus_type: normalizedCampusType },
    });

    res.status(201).json(campus);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/campuses/:id
router.put('/:id', authorize('super_admin'), async (req, res) => {
  try {
    const campus = await Campus.findOne({ where: { id: req.params.id, deleted_at: null } });
    if (!campus) {
      return res.status(404).json({ error: 'Campus not found' });
    }

    const oldValues = {
      name: campus.name,
      address: campus.address,
      phone: campus.phone,
      campus_type: campus.campus_type,
    };
    const { name, address, phone, is_active, campus_type } = req.body;

    if (campus_type !== undefined && !['school', 'college'].includes(campus_type)) {
      return res.status(400).json({ error: 'Campus type must be either school or college' });
    }

    await campus.update({
      name: name || campus.name,
      address: address !== undefined ? address : campus.address,
      phone: phone !== undefined ? phone : campus.phone,
      is_active: is_active !== undefined ? is_active : campus.is_active,
      campus_type: campus_type !== undefined ? campus_type : campus.campus_type,
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'campus.update',
      entity_type: 'campus',
      entity_id: campus.id,
      old_values: oldValues,
      new_values: {
        name: campus.name,
        address: campus.address,
        phone: campus.phone,
        campus_type: campus.campus_type,
      },
    });

    res.json(campus);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/campuses/:id (soft delete)
router.delete('/:id', authorize('super_admin'), async (req, res) => {
  try {
    const campus = await Campus.findOne({ where: { id: req.params.id, deleted_at: null } });
    if (!campus) {
      return res.status(404).json({ error: 'Campus not found' });
    }

    await campus.update({ deleted_at: new Date(), is_active: false });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'campus.delete',
      entity_type: 'campus',
      entity_id: campus.id,
    });

    res.json({ message: 'Campus deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
