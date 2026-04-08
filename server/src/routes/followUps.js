import { Router } from 'express';
import { Op } from 'sequelize';
import { InquiryFollowUp, Inquiry, User, Campus } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { authorize, scopeToCampus } from '../middleware/authorize.js';

const router = Router();
const VALID_CAMPUS_TYPES = ['school', 'college'];
const STAFF_ROLE_SCOPE = ['super_admin', 'admin', 'staff'];

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'staff'));
router.use(scopeToCampus);

async function buildInquiryWhere(req) {
  const where = { deleted_at: null, ...req.campusScope };
  const campusType = req.query.campus_type;

  if (req.user.role === 'super_admin' && VALID_CAMPUS_TYPES.includes(campusType)) {
    const campuses = await Campus.findAll({
      where: { deleted_at: null, is_active: true, campus_type: campusType },
      attributes: ['id'],
      raw: true,
    });
    const campusIds = campuses.map(c => c.id);
    where.campus_id = campusIds.length ? { [Op.in]: campusIds } : -1;
  }

  return where;
}

// GET /api/follow-ups
router.get('/', async (req, res) => {
  try {
    const { inquiry_id, staff_id, date_from, date_to, type, page = 1, limit = 20 } = req.query;

    const where = {};
    if (inquiry_id) where.inquiry_id = inquiry_id;
    if (staff_id) where.staff_id = staff_id;
    if (type) where.type = type;

    if (req.user.role === 'staff') {
      where.staff_id = req.user.id;
    }

    if (date_from || date_to) {
      where.follow_up_date = {};
      if (date_from) where.follow_up_date[Op.gte] = date_from;
      if (date_to) where.follow_up_date[Op.lte] = date_to;
    }

    const inquiryWhere = await buildInquiryWhere(req);
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await InquiryFollowUp.findAndCountAll({
      where,
      include: [
        {
          model: Inquiry,
          as: 'inquiry',
          attributes: ['id', 'student_name', 'parent_name', 'parent_phone', 'status'],
          where: inquiryWhere,
          required: true,
        },
        {
          model: User,
          as: 'staff',
          attributes: ['id', 'name', 'role'],
          where: { role: { [Op.in]: STAFF_ROLE_SCOPE } },
          required: true,
        },
      ],
      order: [['follow_up_date', 'DESC']],
      limit: parseInt(limit),
      offset,
      distinct: true,
    });

    res.json({
      followUps: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/follow-ups/due-today
router.get('/due-today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const where = { next_action_date: today };

    if (req.user.role === 'staff') {
      where.staff_id = req.user.id;
    }

    const inquiryWhere = await buildInquiryWhere(req);
    const followUps = await InquiryFollowUp.findAll({
      where,
      include: [
        {
          model: Inquiry,
          as: 'inquiry',
          attributes: ['id', 'student_name', 'parent_name', 'parent_phone', 'status'],
          where: inquiryWhere,
          required: true,
        },
        {
          model: User,
          as: 'staff',
          attributes: ['id', 'name', 'role'],
          where: { role: { [Op.in]: STAFF_ROLE_SCOPE } },
          required: true,
        },
      ],
      order: [['follow_up_date', 'DESC']],
    });

    res.json(followUps);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/follow-ups
router.post('/', async (req, res) => {
  try {
    const {
      inquiry_id, follow_up_date, type, duration_minutes,
      notes, interest_level, next_action, next_action_date, was_on_time,
    } = req.body;

    if (!inquiry_id || !type) {
      return res.status(400).json({ error: 'Inquiry and type are required' });
    }

    const inquiryWhere = await buildInquiryWhere(req);
    const inquiry = await Inquiry.findOne({
      where: { ...inquiryWhere, id: inquiry_id },
    });
    if (!inquiry) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }

    const followUp = await InquiryFollowUp.create({
      inquiry_id,
      follow_up_date: follow_up_date || new Date(),
      type,
      duration_minutes,
      staff_id: req.user.id,
      notes,
      interest_level,
      next_action,
      next_action_date,
      was_on_time,
      created_by: req.user.id,
    });

    // Update inquiry tracking fields
    const updateData = {
      last_contact_date: new Date(),
      updated_by: req.user.id,
    };
    if (next_action_date) {
      updateData.next_follow_up_date = next_action_date;
    }
    if (interest_level) {
      updateData.interest_level = interest_level;
    }
    await inquiry.update(updateData);

    const created = await InquiryFollowUp.findByPk(followUp.id, {
      include: [
        { model: Inquiry, as: 'inquiry', attributes: ['id', 'student_name', 'parent_name'] },
        { model: User, as: 'staff', attributes: ['id', 'name'] },
      ],
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('Create follow-up error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/follow-ups/:id
router.put('/:id', async (req, res) => {
  try {
    const followUp = await InquiryFollowUp.findByPk(req.params.id);
    if (!followUp) {
      return res.status(404).json({ error: 'Follow-up not found' });
    }

    if (req.user.role === 'staff' && followUp.staff_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { follow_up_date, type, duration_minutes, notes, interest_level, next_action, next_action_date, was_on_time } = req.body;

    await followUp.update({
      follow_up_date: follow_up_date || followUp.follow_up_date,
      type: type || followUp.type,
      duration_minutes: duration_minutes !== undefined ? duration_minutes : followUp.duration_minutes,
      notes: notes !== undefined ? notes : followUp.notes,
      interest_level: interest_level || followUp.interest_level,
      next_action: next_action !== undefined ? next_action : followUp.next_action,
      next_action_date: next_action_date !== undefined ? next_action_date : followUp.next_action_date,
      was_on_time: was_on_time !== undefined ? was_on_time : followUp.was_on_time,
    });

    res.json(followUp);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/follow-ups/:id
router.delete('/:id', async (req, res) => {
  try {
    const followUp = await InquiryFollowUp.findByPk(req.params.id);
    if (!followUp) {
      return res.status(404).json({ error: 'Follow-up not found' });
    }

    await followUp.destroy();
    res.json({ message: 'Follow-up deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
