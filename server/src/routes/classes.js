import { Router } from 'express';
import { Op } from 'sequelize';
import { ClassLevel, Section, Subject, Campus } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { authorize, scopeToCampus } from '../middleware/authorize.js';

const router = Router();
const VALID_CAMPUS_TYPES = ['school', 'college'];

router.use(authenticate);
router.use(scopeToCampus);

// GET /api/classes
router.get('/', async (req, res) => {
  try {
    const where = { is_active: true };
    const campusType = req.user.role === 'super_admin' && VALID_CAMPUS_TYPES.includes(req.query.campus_type)
      ? req.query.campus_type
      : null;

    if (req.query.campus_id) {
      where.campus_id = req.query.campus_id;
    } else if (campusType) {
      const campuses = await Campus.findAll({
        where: { deleted_at: null, is_active: true, campus_type: campusType },
        attributes: ['id'],
        raw: true,
      });
      const campusIds = campuses.map(c => c.id);
      where.campus_id = campusIds.length ? { [Op.in]: campusIds } : -1;
    } else if (req.campusScope.campus_id) {
      where.campus_id = req.campusScope.campus_id;
    }

    const classes = await ClassLevel.findAll({
      where,
      include: [
        { model: Section, as: 'sections', where: { is_active: true }, required: false },
        { model: Campus, as: 'campus', attributes: ['id', 'name', 'campus_type'], required: false },
      ],
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
    });

    res.json(classes);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/classes
router.post('/', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { name, campus_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Class name is required' });
    }

    const assignedCampus = req.user.role === 'admin' ? req.user.campus_id : campus_id;

    const maxOrder = await ClassLevel.max('sort_order', {
      where: assignedCampus ? { campus_id: assignedCampus } : {},
    }) || 0;

    const classLevel = await ClassLevel.create({
      name,
      campus_id: assignedCampus,
      sort_order: maxOrder + 1,
    });

    res.status(201).json(classLevel);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/classes/:id
router.put('/:id', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const classLevel = await ClassLevel.findByPk(req.params.id);
    if (!classLevel) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const { name, sort_order, is_active, campus_id } = req.body;

    await classLevel.update({
      name: name || classLevel.name,
      sort_order: sort_order !== undefined ? sort_order : classLevel.sort_order,
      is_active: is_active !== undefined ? is_active : classLevel.is_active,
      campus_id: req.user.role === 'super_admin' && campus_id !== undefined ? campus_id : classLevel.campus_id,
    });

    res.json(classLevel);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/classes/:id (soft delete)
router.delete('/:id', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const classLevel = await ClassLevel.findByPk(req.params.id);
    if (!classLevel) {
      return res.status(404).json({ error: 'Class not found' });
    }

    await classLevel.update({ is_active: false });
    res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/classes/:classId/sections/:id (soft delete)
router.delete('/:classId/sections/:id', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const section = await Section.findOne({
      where: { id: req.params.id, class_level_id: req.params.classId },
    });
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    await section.update({ is_active: false });
    res.json({ message: 'Section deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/classes/:id/sections
router.get('/:id/sections', async (req, res) => {
  try {
    const sections = await Section.findAll({
      where: { class_level_id: req.params.id, is_active: true, ...req.campusScope },
      order: [['name', 'ASC']],
    });

    res.json(sections);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/classes/:id/sections
router.post('/:id/sections', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { name, campus_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Section name is required' });
    }

    const assignedCampus = req.user.role === 'admin' ? req.user.campus_id : campus_id;

    if (!assignedCampus) {
      return res.status(400).json({ error: 'Campus is required' });
    }

    const section = await Section.create({
      name,
      class_level_id: req.params.id,
      campus_id: assignedCampus,
    });

    res.status(201).json(section);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/classes/:id/subjects
router.get('/:id/subjects', async (req, res) => {
  try {
    const subjects = await Subject.findAll({
      where: { class_level_id: req.params.id, is_active: true },
      order: [['name', 'ASC']],
    });

    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/classes/:id/subjects
router.post('/:id/subjects', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Subject name is required' });
    }

    const subject = await Subject.create({
      name,
      class_level_id: req.params.id,
    });

    res.status(201).json(subject);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
