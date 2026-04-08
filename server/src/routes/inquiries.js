import { Router } from 'express';
import { Op } from 'sequelize';
import {
  Inquiry, InquiryFollowUp, InquiryTag, InquiryTagMap,
  InquirySource, Campus, ClassLevel, User, AuditLog, sequelize,
} from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { scopeToCampus } from '../middleware/authorize.js';

const router = Router();
const VALID_CAMPUS_TYPES = ['school', 'college'];
const STAFF_ROLE_SCOPE = ['super_admin', 'admin', 'staff'];

router.use(authenticate);
router.use(scopeToCampus);

const ALLOWED_SORT_FIELDS = new Set([
  'created_at',
  'updated_at',
  'inquiry_date',
  'next_follow_up_date',
  'previous_marks_obtained',
  'student_name',
  'parent_name',
  'priority',
  'status',
]);

async function applyCampusTypeScope(req, where) {
  const campusType = req.user.role === 'super_admin' ? req.query.campus_type : null;
  if (!VALID_CAMPUS_TYPES.includes(campusType)) return;

  const campuses = await Campus.findAll({
    where: { deleted_at: null, is_active: true, campus_type: campusType },
    attributes: ['id'],
    raw: true,
  });
  const campusIds = campuses.map(c => c.id);
  where.campus_id = campusIds.length ? { [Op.in]: campusIds } : -1;
}

async function validateAssignedStaff(req, assignedStaffId, inquiryCampusId) {
  if (!assignedStaffId) return null;

  const normalizedStaffId = Number.parseInt(assignedStaffId, 10);
  if (!Number.isInteger(normalizedStaffId)) {
    return { error: 'Assigned staff is invalid' };
  }

  const assignedStaff = await User.findOne({
    where: {
      id: normalizedStaffId,
      deleted_at: null,
      is_active: true,
      role: { [Op.in]: STAFF_ROLE_SCOPE },
    },
    attributes: ['id', 'role', 'campus_id'],
    raw: true,
  });

  if (!assignedStaff) {
    return { error: 'Assigned staff must be an active admin/staff user' };
  }

  if (req.user.role === 'admin' && assignedStaff.role !== 'super_admin' && assignedStaff.campus_id !== req.user.campus_id) {
    return { error: 'Assigned staff must belong to your campus' };
  }

  const normalizedCampusId = Number.parseInt(inquiryCampusId, 10);
  if (
    Number.isInteger(normalizedCampusId)
    && assignedStaff.role !== 'super_admin'
    && assignedStaff.campus_id !== normalizedCampusId
  ) {
    return { error: 'Assigned staff must belong to inquiry campus' };
  }

  return { id: normalizedStaffId };
}

// GET /api/inquiries
router.get('/', async (req, res) => {
  try {
    const {
      status, campus_id, class_id, source_id, assigned_staff_id,
      priority, date_from, date_to, search, tag_id,
      gender, area, previous_institute, followup_today, followup_filter,
      page = 1, limit = 20, sort_by = 'created_at', sort_order = 'DESC',
    } = req.query;

    const where = { deleted_at: null, ...req.campusScope };
    await applyCampusTypeScope(req, where);

    // Support multi-value filters (comma-separated)
    if (status) where.status = status.includes(',') ? { [Op.in]: status.split(',') } : status;
    if (campus_id && req.user.role === 'super_admin') where.campus_id = campus_id.includes?.(',') ? { [Op.in]: campus_id.split(',') } : campus_id;
    if (class_id) where.class_applying_id = String(class_id).includes(',') ? { [Op.in]: class_id.split(',') } : class_id;
    if (source_id) where.source_id = String(source_id).includes(',') ? { [Op.in]: source_id.split(',') } : source_id;
    if (assigned_staff_id) where.assigned_staff_id = String(assigned_staff_id).includes(',') ? { [Op.in]: assigned_staff_id.split(',') } : assigned_staff_id;
    if (priority) where.priority = priority.includes(',') ? { [Op.in]: priority.split(',') } : priority;
    if (gender) where.gender = gender.includes(',') ? { [Op.in]: gender.split(',') } : gender;
    if (area) where.area = area.includes(',') ? { [Op.in]: area.split(',') } : area;
    if (previous_institute) {
      where.previous_institute = previous_institute.includes(',')
        ? { [Op.in]: previous_institute.split(',') }
        : previous_institute;
    }

    const todayDate = new Date();
    const today = todayDate.toISOString().split('T')[0];
    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().split('T')[0];
    const nextWeekDate = new Date(todayDate);
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);
    const nextWeek = nextWeekDate.toISOString().split('T')[0];

    if (followup_filter === 'today') {
      where.next_follow_up_date = today;
    } else if (followup_filter === 'overdue') {
      where.next_follow_up_date = { [Op.lt]: today, [Op.ne]: null };
    } else if (followup_filter === 'tomorrow') {
      where.next_follow_up_date = tomorrow;
    } else if (followup_filter === 'next_7_days') {
      where.next_follow_up_date = { [Op.gte]: today, [Op.lte]: nextWeek };
    } else if (followup_filter === 'no_date') {
      where.next_follow_up_date = { [Op.is]: null };
    } else if (followup_today === 'true' || followup_today === '1') {
      // Backward compatibility with old client filter
      where.next_follow_up_date = today;
    }

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
        { student_phone: { [Op.iLike]: `%${search}%` } },
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

    const safeSortBy = ALLOWED_SORT_FIELDS.has(sort_by) ? sort_by : 'created_at';
    const safeSortOrder = String(sort_order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await Inquiry.findAndCountAll({
      where,
      include: includeOptions,
      order: [[safeSortBy, safeSortOrder]],
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

// GET /api/inquiries/filter-options
router.get('/filter-options', async (req, res) => {
  try {
    const where = { deleted_at: null, ...req.campusScope };
    await applyCampusTypeScope(req, where);
    const rows = await Inquiry.findAll({
      where,
      attributes: ['area', 'previous_institute'],
      raw: true,
    });

    const clean = (value) => (typeof value === 'string' ? value.trim() : '');
    const areas = [...new Set(rows.map(r => clean(r.area)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    const previous_institutes = [...new Set(rows.map(r => clean(r.previous_institute)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    res.json({ areas, previous_institutes });
  } catch (error) {
    console.error('Inquiry filter options error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/inquiries/pipeline
router.get('/pipeline', async (req, res) => {
  try {
    const where = { deleted_at: null, ...req.campusScope };
    await applyCampusTypeScope(req, where);

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
    await applyCampusTypeScope(req, where);

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
    await applyCampusTypeScope(req, baseWhere);

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
      city, area, student_name, date_of_birth, gender, student_phone, class_applying_id,
      current_school, previous_institute, previous_marks_obtained, previous_total_marks, previous_major_subjects,
      special_needs, inquiry_date, source_id, referral_parent_name, package_name, package_amount,
      campus_id, session_preference, assigned_staff_id, priority, notes, tag_ids,
    } = req.body;

    const assignedCampus = req.user.role === 'admin' ? req.user.campus_id : (campus_id || req.user.campus_id);
    const campusRecord = await Campus.findOne({
      where: { id: assignedCampus, deleted_at: null, is_active: true },
      attributes: ['id', 'campus_type'],
      raw: true,
    });
    const isCollegeFlow = campusRecord?.campus_type === 'college';

    if (!student_name || !class_applying_id) {
      return res.status(400).json({
        error: 'Student name and class are required',
      });
    }

    if (!isCollegeFlow && (!parent_name || !parent_phone)) {
      return res.status(400).json({
        error: 'Parent name and phone are required for school inquiries',
      });
    }

    const normalizedParentName = isCollegeFlow
      ? (parent_name || student_name || 'Self')
      : parent_name;
    const normalizedParentPhone = isCollegeFlow
      ? (parent_phone || student_phone || 'N/A')
      : parent_phone;
    const normalizedRelationship = relationship || (isCollegeFlow ? 'other' : 'father');

    let normalizedAssignedStaffId = null;
    if (assigned_staff_id) {
      const validation = await validateAssignedStaff(req, assigned_staff_id, assignedCampus);
      if (validation?.error) {
        return res.status(400).json({ error: validation.error });
      }
      normalizedAssignedStaffId = validation.id;
    }

    const inquiry = await Inquiry.create({
      parent_name: normalizedParentName,
      relationship: normalizedRelationship,
      parent_phone: normalizedParentPhone,
      parent_whatsapp,
      parent_email,
      city, area, student_name, date_of_birth, gender, student_phone, class_applying_id,
      current_school, previous_institute, previous_marks_obtained, previous_total_marks, previous_major_subjects,
      special_needs,
      inquiry_date: inquiry_date || new Date().toISOString().split('T')[0],
      source_id, referral_parent_name, package_name, package_amount,
      campus_id: assignedCampus,
      session_preference, assigned_staff_id: normalizedAssignedStaffId, priority,
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
      new_values: { student_name, parent_name: normalizedParentName, status: 'new' },
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
    const targetCampusId = updateData.campus_id !== undefined && updateData.campus_id !== null
      ? updateData.campus_id
      : inquiry.campus_id;
    if (updateData.assigned_staff_id !== undefined && updateData.assigned_staff_id !== null) {
      const validation = await validateAssignedStaff(req, updateData.assigned_staff_id, targetCampusId);
      if (validation?.error) {
        return res.status(400).json({ error: validation.error });
      }
      updateData.assigned_staff_id = validation.id;
    }

    if (updateData.previous_marks_obtained !== undefined && updateData.previous_marks_obtained !== null) {
      updateData.previous_marks_obtained = Number.parseInt(updateData.previous_marks_obtained, 10);
    }
    if (updateData.previous_total_marks !== undefined && updateData.previous_total_marks !== null) {
      updateData.previous_total_marks = Number.parseInt(updateData.previous_total_marks, 10);
    }
    if (updateData.package_amount !== undefined && updateData.package_amount !== null) {
      updateData.package_amount = Number.parseInt(updateData.package_amount, 10);
    }

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
    let normalizedAssignedStaffId = null;

    if (assigned_staff_id !== null && assigned_staff_id !== undefined && assigned_staff_id !== '') {
      const validation = await validateAssignedStaff(req, assigned_staff_id, inquiry.campus_id);
      if (validation?.error) {
        return res.status(400).json({ error: validation.error });
      }
      normalizedAssignedStaffId = validation.id;
    }

    await inquiry.update({ assigned_staff_id: normalizedAssignedStaffId, updated_by: req.user.id });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'inquiry.assign',
      entity_type: 'inquiry',
      entity_id: inquiry.id,
      old_values: { assigned_staff_id: oldStaff },
      new_values: { assigned_staff_id: normalizedAssignedStaffId },
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
