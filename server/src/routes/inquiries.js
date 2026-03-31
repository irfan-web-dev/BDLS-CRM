import { Router } from 'express';
import { Op } from 'sequelize';
import {
  Inquiry, InquiryFollowUp, InquiryTag, InquiryTagMap,
  InquirySource, Campus, ClassLevel, User, AuditLog, sequelize,
} from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { scopeToCampus } from '../middleware/authorize.js';

const router = Router();

router.use(authenticate);
router.use(scopeToCampus);

// GET /api/inquiries
router.get('/', async (req, res) => {
  try {
    const {
      status, campus_id, class_id, source_id, assigned_staff_id,
      priority, date_from, date_to, search, tag_id,
      page = 1, limit = 20, sort_by = 'created_at', sort_order = 'DESC',
    } = req.query;

    const where = { deleted_at: null, ...req.campusScope };

    // Support multi-value filters (comma-separated)
    if (status) where.status = status.includes(',') ? { [Op.in]: status.split(',') } : status;
    if (campus_id && req.user.role === 'super_admin') where.campus_id = campus_id.includes?.(',') ? { [Op.in]: campus_id.split(',') } : campus_id;
    if (class_id) where.class_applying_id = String(class_id).includes(',') ? { [Op.in]: class_id.split(',') } : class_id;
    if (source_id) where.source_id = String(source_id).includes(',') ? { [Op.in]: source_id.split(',') } : source_id;
    if (assigned_staff_id) where.assigned_staff_id = String(assigned_staff_id).includes(',') ? { [Op.in]: assigned_staff_id.split(',') } : assigned_staff_id;
    if (priority) where.priority = priority.includes(',') ? { [Op.in]: priority.split(',') } : priority;

    if (date_from || date_to) {
      where.inquiry_date = {};
      if (date_from) where.inquiry_date[Op.gte] = date_from;
      if (date_to) where.inquiry_date[Op.lte] = date_to;
    }

    if (search) {
      where[Op.or] = [
        { parent_name: { [Op.iLike]: `%${search}%` } },
        { student_name: { [Op.iLike]: `%${search}%` } },
        { parent_phone: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const includeOptions = [
      { model: Campus, as: 'campus', attributes: ['id', 'name'] },
      { model: ClassLevel, as: 'classApplying', attributes: ['id', 'name'] },
      { model: InquirySource, as: 'source', attributes: ['id', 'name'] },
      { model: User, as: 'assignedStaff', attributes: ['id', 'name'] },
      { model: InquiryTag, as: 'tags', attributes: ['id', 'name'], through: { attributes: [] } },
    ];

    // If filtering by tag, add a subquery
    let inquiryIds = null;
    if (tag_id) {
      const tagMaps = await InquiryTagMap.findAll({ where: { tag_id }, attributes: ['inquiry_id'] });
      inquiryIds = tagMaps.map(t => t.inquiry_id);
      where.id = { [Op.in]: inquiryIds };
    }

    const { count, rows } = await Inquiry.findAndCountAll({
      where,
      include: includeOptions,
      order: [[sort_by, sort_order.toUpperCase()]],
      limit: parseInt(limit),
      offset,
      distinct: true,
    });

    res.json({
      inquiries: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('List inquiries error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/inquiries/pipeline
router.get('/pipeline', async (req, res) => {
  try {
    const where = { deleted_at: null, ...req.campusScope };

    const pipeline = await Inquiry.findAll({
      where,
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('Inquiry.id')), 'count'],
      ],
      group: ['status'],
      raw: true,
    });

    res.json(pipeline);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/inquiries/overdue
router.get('/overdue', async (req, res) => {
  try {
    const where = {
      deleted_at: null,
      ...req.campusScope,
      next_follow_up_date: { [Op.lt]: new Date().toISOString().split('T')[0] },
      status: { [Op.notIn]: ['admitted', 'not_interested', 'lost', 'no_response'] },
    };

    const inquiries = await Inquiry.findAll({
      where,
      include: [
        { model: User, as: 'assignedStaff', attributes: ['id', 'name'] },
        { model: ClassLevel, as: 'classApplying', attributes: ['id', 'name'] },
      ],
      order: [['next_follow_up_date', 'ASC']],
    });

    res.json(inquiries);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/inquiries/reminders
router.get('/reminders', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const baseWhere = {
      deleted_at: null,
      ...req.campusScope,
      status: { [Op.notIn]: ['admitted', 'not_interested', 'lost', 'no_response'] },
    };

    const include = [
      { model: User, as: 'assignedStaff', attributes: ['id', 'name'] },
      { model: ClassLevel, as: 'classApplying', attributes: ['id', 'name'] },
    ];

    // Due today
    const dueToday = await Inquiry.findAll({
      where: { ...baseWhere, next_follow_up_date: today },
      include,
    });

    // Overdue
    const overdue = await Inquiry.findAll({
      where: { ...baseWhere, next_follow_up_date: { [Op.lt]: today, [Op.ne]: null } },
      include,
      order: [['next_follow_up_date', 'ASC']],
    });

    // No activity for 3+ days
    const noActivity = await Inquiry.findAll({
      where: {
        ...baseWhere,
        [Op.or]: [
          { last_contact_date: { [Op.lt]: threeDaysAgo } },
          { last_contact_date: null, created_at: { [Op.lt]: threeDaysAgo } },
        ],
      },
      include,
    });

    res.json({ dueToday, overdue, noActivity });
  } catch (error) {
    console.error('Reminders error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/inquiries/:id
router.get('/:id', async (req, res) => {
  try {
    const inquiry = await Inquiry.findOne({
      where: { id: req.params.id, deleted_at: null },
      include: [
        { model: Campus, as: 'campus' },
        { model: ClassLevel, as: 'classApplying' },
        { model: InquirySource, as: 'source' },
        { model: User, as: 'assignedStaff', attributes: { exclude: ['password'] } },
        { model: User, as: 'createdBy', attributes: ['id', 'name'] },
        { model: User, as: 'updatedBy', attributes: ['id', 'name'] },
        { model: InquiryTag, as: 'tags', through: { attributes: [] } },
        {
          model: InquiryFollowUp,
          as: 'followUps',
          include: [{ model: User, as: 'staff', attributes: ['id', 'name'] }],
          order: [['follow_up_date', 'DESC']],
        },
      ],
    });

    if (!inquiry) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }

    res.json(inquiry);
  } catch (error) {
    console.error('Get inquiry error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/inquiries
router.post('/', async (req, res) => {
  try {
    const {
      parent_name, relationship, parent_phone, parent_whatsapp, parent_email,
      city, area, student_name, date_of_birth, gender, class_applying_id,
      current_school, special_needs, inquiry_date, source_id, referral_parent_name,
      campus_id, session_preference, assigned_staff_id, priority, notes, tag_ids,
    } = req.body;

    if (!parent_name || !parent_phone || !student_name || !class_applying_id) {
      return res.status(400).json({
        error: 'Parent name, phone, student name and class are required',
      });
    }

    const assignedCampus = req.user.role === 'admin' ? req.user.campus_id : (campus_id || req.user.campus_id);

    const inquiry = await Inquiry.create({
      parent_name, relationship, parent_phone, parent_whatsapp, parent_email,
      city, area, student_name, date_of_birth, gender, class_applying_id,
      current_school, special_needs,
      inquiry_date: inquiry_date || new Date().toISOString().split('T')[0],
      source_id, referral_parent_name,
      campus_id: assignedCampus,
      session_preference, assigned_staff_id, priority,
      notes, status: 'new',
      created_by: req.user.id,
    });

    // Attach tags
    if (tag_ids && tag_ids.length > 0) {
      await InquiryTagMap.bulkCreate(
        tag_ids.map(tag_id => ({ inquiry_id: inquiry.id, tag_id }))
      );
    }

    await AuditLog.create({
      user_id: req.user.id,
      action: 'inquiry.create',
      entity_type: 'inquiry',
      entity_id: inquiry.id,
      new_values: { student_name, parent_name, status: 'new' },
    });

    const created = await Inquiry.findByPk(inquiry.id, {
      include: [
        { model: Campus, as: 'campus' },
        { model: ClassLevel, as: 'classApplying' },
        { model: InquirySource, as: 'source' },
        { model: User, as: 'assignedStaff', attributes: ['id', 'name'] },
        { model: InquiryTag, as: 'tags', through: { attributes: [] } },
      ],
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('Create inquiry error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/inquiries/:id
router.put('/:id', async (req, res) => {
  try {
    const inquiry = await Inquiry.findOne({ where: { id: req.params.id, deleted_at: null } });
    if (!inquiry) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }

    const oldValues = inquiry.toJSON();
    const { tag_ids, ...updateData } = req.body;

    updateData.updated_by = req.user.id;
    await inquiry.update(updateData);

    // Update tags if provided
    if (tag_ids !== undefined) {
      await InquiryTagMap.destroy({ where: { inquiry_id: inquiry.id } });
      if (tag_ids.length > 0) {
        await InquiryTagMap.bulkCreate(
          tag_ids.map(tag_id => ({ inquiry_id: inquiry.id, tag_id }))
        );
      }
    }

    await AuditLog.create({
      user_id: req.user.id,
      action: 'inquiry.update',
      entity_type: 'inquiry',
      entity_id: inquiry.id,
      old_values: { status: oldValues.status, priority: oldValues.priority },
      new_values: { status: inquiry.status, priority: inquiry.priority },
    });

    const updated = await Inquiry.findByPk(inquiry.id, {
      include: [
        { model: Campus, as: 'campus' },
        { model: ClassLevel, as: 'classApplying' },
        { model: InquirySource, as: 'source' },
        { model: User, as: 'assignedStaff', attributes: ['id', 'name'] },
        { model: InquiryTag, as: 'tags', through: { attributes: [] } },
      ],
    });

    res.json(updated);
  } catch (error) {
    console.error('Update inquiry error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/inquiries/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const inquiry = await Inquiry.findOne({ where: { id: req.params.id, deleted_at: null } });

    if (!inquiry) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }

    const oldStatus = inquiry.status;
    await inquiry.update({
      status,
      status_changed_at: new Date(),
      notes: notes || inquiry.notes,
      updated_by: req.user.id,
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'inquiry.status_change',
      entity_type: 'inquiry',
      entity_id: inquiry.id,
      old_values: { status: oldStatus },
      new_values: { status },
    });

    res.json(inquiry);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/inquiries/:id/assign
router.patch('/:id/assign', async (req, res) => {
  try {
    const { assigned_staff_id } = req.body;
    const inquiry = await Inquiry.findOne({ where: { id: req.params.id, deleted_at: null } });

    if (!inquiry) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }

    const oldStaff = inquiry.assigned_staff_id;
    await inquiry.update({ assigned_staff_id, updated_by: req.user.id });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'inquiry.assign',
      entity_type: 'inquiry',
      entity_id: inquiry.id,
      old_values: { assigned_staff_id: oldStaff },
      new_values: { assigned_staff_id },
    });

    res.json(inquiry);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/inquiries/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const inquiry = await Inquiry.findOne({ where: { id: req.params.id, deleted_at: null } });
    if (!inquiry) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }

    await inquiry.update({ deleted_at: new Date() });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'inquiry.delete',
      entity_type: 'inquiry',
      entity_id: inquiry.id,
    });

    res.json({ message: 'Inquiry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
