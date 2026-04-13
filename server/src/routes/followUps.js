import { Router } from 'express';
import { Op } from 'sequelize';
import { InquiryFollowUp, Inquiry, User, Campus, AuditLog } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { authorize, scopeToCampus } from '../middleware/authorize.js';
import { applyOverdueTracking } from '../utils/overdueTracking.js';

const router = Router();
const VALID_CAMPUS_TYPES = ['school', 'college'];
const STAFF_ROLE_SCOPE = ['super_admin', 'admin', 'staff'];
const FOLLOW_UP_TRACKED_FIELDS = [
  'inquiry_id',
  'follow_up_date',
  'type',
  'duration_minutes',
  'staff_id',
  'notes',
  'interest_level',
  'next_action',
  'next_action_date',
  'was_on_time',
];

router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'staff'));
router.use(scopeToCampus);

function parseIdList(value) {
  if (value === null || value === undefined || value === '') return [];
  return String(value)
    .split(',')
    .map(v => Number.parseInt(v, 10))
    .filter(Number.isInteger);
}

function normalizeTrackedValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

function pickFollowUpState(followUp) {
  const source = followUp?.toJSON ? followUp.toJSON() : followUp;
  return FOLLOW_UP_TRACKED_FIELDS.reduce((acc, key) => {
    acc[key] = normalizeTrackedValue(source?.[key]);
    return acc;
  }, {});
}

function buildChangedFields(oldState, newState) {
  const keys = new Set([...Object.keys(oldState || {}), ...Object.keys(newState || {})]);
  const changed = {};

  keys.forEach((key) => {
    const before = normalizeTrackedValue(oldState?.[key]);
    const after = normalizeTrackedValue(newState?.[key]);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changed[key] = { from: before, to: after };
    }
  });

  return changed;
}

function buildLegacyHistoryEntry(followUp) {
  const createdAt = followUp?.created_at || followUp?.createdAt || followUp?.follow_up_date || null;
  const staffName = followUp?.staff?.name || null;
  const staffId = followUp?.staff?.id || followUp?.staff_id || null;

  return {
    id: `legacy-follow-up-${followUp.id}`,
    action: 'follow_up.create',
    old_values: {},
    new_values: pickFollowUpState(followUp),
    created_at: createdAt,
    user_id: staffId,
    user: staffId ? { id: staffId, name: staffName } : null,
    is_legacy_fallback: true,
  };
}

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
    const {
      inquiry_id,
      staff_id,
      staff_ids,
      date_from,
      date_to,
      type,
      include_history = 'true',
      page = 1,
      limit = 20,
    } = req.query;
    const includeHistory = String(include_history).toLowerCase() !== 'false';

    const where = {};
    if (inquiry_id) where.inquiry_id = inquiry_id;
    if (type) {
      where.type = String(type).includes(',')
        ? { [Op.in]: String(type).split(',').map(t => t.trim()).filter(Boolean) }
        : type;
    }

    if (req.user.role === 'staff') {
      where.staff_id = req.user.id;
    } else {
      const parsedStaffIds = parseIdList(staff_ids);
      if (parsedStaffIds.length) {
        where.staff_id = { [Op.in]: parsedStaffIds };
      } else if (staff_id) {
        where.staff_id = staff_id;
      }
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

    const followUps = rows.map((row) => {
      const item = row.toJSON();
      return {
        ...item,
        created_at: item.created_at || item.createdAt || null,
        updated_at: item.updated_at || item.updatedAt || null,
      };
    });
    if (includeHistory && followUps.length > 0) {
      const followUpIds = followUps.map(f => f.id);
      const historyRows = await AuditLog.findAll({
        where: {
          entity_type: 'follow_up',
          entity_id: { [Op.in]: followUpIds },
        },
        attributes: ['id', 'action', 'entity_id', 'old_values', 'new_values', 'created_at', 'user_id'],
        include: [{ model: User, as: 'user', attributes: ['id', 'name'], required: false }],
        order: [['created_at', 'DESC']],
      });

      const historyByFollowUpId = new Map();
      historyRows.forEach((entry) => {
        const log = entry.toJSON();
        const list = historyByFollowUpId.get(log.entity_id) || [];
        list.push({
          id: log.id,
          action: log.action,
          old_values: log.old_values,
          new_values: log.new_values,
          created_at: log.created_at || log.createdAt || null,
          user: log.user || null,
          user_id: log.user_id,
        });
        historyByFollowUpId.set(log.entity_id, list);
      });

      followUps.forEach((followUp) => {
        const history = historyByFollowUpId.get(followUp.id) || [];
        followUp.change_history = history.length ? history : [buildLegacyHistoryEntry(followUp)];
      });
    }

    res.json({
      followUps,
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

    const now = new Date();
    // Update inquiry tracking fields
    const updateData = {
      last_contact_date: now,
      updated_by: req.user.id,
    };
    if (next_action_date !== undefined) {
      updateData.next_follow_up_date = next_action_date || null;
    }
    if (interest_level !== undefined) {
      updateData.interest_level = interest_level || null;
    }
    const trackedInquiryUpdate = applyOverdueTracking(inquiry, updateData, now);
    await inquiry.update(trackedInquiryUpdate);

    await AuditLog.create({
      user_id: req.user.id,
      action: 'follow_up.create',
      entity_type: 'follow_up',
      entity_id: followUp.id,
      new_values: pickFollowUpState(followUp),
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

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
    const oldState = pickFollowUpState(followUp);

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

    if (next_action_date !== undefined || interest_level !== undefined) {
      const inquiryWhere = await buildInquiryWhere(req);
      const inquiry = await Inquiry.findOne({
        where: { ...inquiryWhere, id: followUp.inquiry_id },
      });
      if (inquiry) {
        const inquiryUpdate = { updated_by: req.user.id };
        if (next_action_date !== undefined) {
          inquiryUpdate.next_follow_up_date = followUp.next_action_date || null;
        }
        if (interest_level !== undefined) {
          inquiryUpdate.interest_level = followUp.interest_level || null;
        }
        const trackedInquiryUpdate = applyOverdueTracking(inquiry, inquiryUpdate);
        await inquiry.update(trackedInquiryUpdate);
      }
    }

    const newState = pickFollowUpState(followUp);
    await AuditLog.create({
      user_id: req.user.id,
      action: 'follow_up.update',
      entity_type: 'follow_up',
      entity_id: followUp.id,
      old_values: oldState,
      new_values: {
        ...newState,
        changed_fields: buildChangedFields(oldState, newState),
      },
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
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

    const oldState = pickFollowUpState(followUp);
    await AuditLog.create({
      user_id: req.user.id,
      action: 'follow_up.delete',
      entity_type: 'follow_up',
      entity_id: followUp.id,
      old_values: oldState,
      new_values: { deleted: true },
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    await followUp.destroy();
    res.json({ message: 'Follow-up deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
