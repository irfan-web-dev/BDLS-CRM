import { Router } from 'express';
import { Op } from 'sequelize';
import {
  Inquiry, InquiryFollowUp, InquiryTag, InquiryTagMap,
  InquirySource, Campus, ClassLevel, User, AuditLog, sequelize,
} from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { scopeToCampus } from '../middleware/authorize.js';
import {
  ACTIVE_INQUIRY_STATUSES,
  applyOverdueTracking,
  todayDateOnly,
} from '../utils/overdueTracking.js';

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
const INQUIRY_AUDIT_FIELDS = [
  'parent_name',
  'relationship',
  'parent_phone',
  'parent_whatsapp',
  'parent_email',
  'city',
  'area',
  'student_name',
  'date_of_birth',
  'gender',
  'student_phone',
  'class_applying_id',
  'current_school',
  'previous_institute',
  'previous_marks_obtained',
  'previous_total_marks',
  'previous_major_subjects',
  'special_needs',
  'inquiry_date',
  'source_id',
  'referral_parent_name',
  'package_name',
  'package_amount',
  'inquiry_form_taken',
  'campus_id',
  'session_preference',
  'assigned_staff_id',
  'priority',
  'status',
  'status_changed_at',
  'interest_level',
  'last_contact_date',
  'next_follow_up_date',
  'was_ever_overdue',
  'first_overdue_date',
  'last_overdue_date',
  'overdue_resolved_count',
  'overdue_last_resolved_at',
  'is_manual_entry',
  'is_sibling',
  'sibling_of_inquiry_id',
  'sibling_group_id',
  'notes',
];
const FOLLOW_UP_AUDIT_FIELDS = [
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

function parseNullableBoolean(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return null;
}

function normalizePhoneValue(value) {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, '');
  return digits || null;
}

function isValidPhoneNumber(value) {
  return /^\d{11}$/.test(String(value || ''));
}

function isFutureDateOnly(value) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const inputDate = parsed.toISOString().slice(0, 10);
  const today = todayDateOnly();
  return inputDate > today;
}

function normalizeAuditValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

function pickInquiryAuditState(inquiryLike) {
  const source = inquiryLike?.toJSON ? inquiryLike.toJSON() : inquiryLike;
  return INQUIRY_AUDIT_FIELDS.reduce((acc, key) => {
    acc[key] = normalizeAuditValue(source?.[key]);
    return acc;
  }, {});
}

function buildChangedFields(oldValues, newValues) {
  const keys = new Set([...Object.keys(oldValues || {}), ...Object.keys(newValues || {})]);
  const changed = {};

  keys.forEach((key) => {
    const before = normalizeAuditValue(oldValues?.[key]);
    const after = normalizeAuditValue(newValues?.[key]);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changed[key] = { from: before, to: after };
    }
  });

  return changed;
}

function pickFollowUpAuditState(followUpLike) {
  const source = followUpLike?.toJSON ? followUpLike.toJSON() : followUpLike;
  return FOLLOW_UP_AUDIT_FIELDS.reduce((acc, key) => {
    acc[key] = normalizeAuditValue(source?.[key]);
    return acc;
  }, {});
}

function buildLegacyFollowUpHistoryEntry(followUp) {
  const createdAt = followUp?.created_at || followUp?.createdAt || followUp?.follow_up_date || null;
  const staffId = followUp?.staff?.id || followUp?.staff_id || null;
  const staffName = followUp?.staff?.name || null;

  return {
    id: `legacy-follow-up-${followUp.id}`,
    action: 'follow_up.create',
    old_values: {},
    new_values: pickFollowUpAuditState(followUp),
    created_at: createdAt,
    user_id: staffId,
    user: staffId ? { id: staffId, name: staffName } : null,
    is_legacy_fallback: true,
  };
}

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

async function resolveSiblingLink(req, {
  isSiblingInput,
  siblingOfInquiryIdInput,
  campusIdInput,
  currentInquiryId = null,
}) {
  const explicitSiblingFlag = parseNullableBoolean(isSiblingInput);
  const normalizedSiblingRefId = Number.parseInt(siblingOfInquiryIdInput, 10);
  const hasSiblingRef = Number.isInteger(normalizedSiblingRefId);
  const isSibling = explicitSiblingFlag === null ? hasSiblingRef : explicitSiblingFlag;

  if (!isSibling) {
    return { is_sibling: false, sibling_of_inquiry_id: null, sibling_group_id: null };
  }

  if (!hasSiblingRef) {
    return { is_sibling: true, sibling_of_inquiry_id: null, sibling_group_id: null };
  }

  if (currentInquiryId && Number(currentInquiryId) === normalizedSiblingRefId) {
    return { error: 'Inquiry cannot be its own sibling reference' };
  }

  const siblingReference = await Inquiry.findOne({
    where: {
      id: normalizedSiblingRefId,
      deleted_at: null,
      ...req.campusScope,
    },
    attributes: ['id', 'campus_id', 'sibling_group_id'],
    raw: true,
  });

  if (!siblingReference) {
    return { error: 'Selected sibling reference was not found in your scope' };
  }

  const normalizedCampusId = Number.parseInt(campusIdInput, 10);
  if (Number.isInteger(normalizedCampusId) && normalizedCampusId !== siblingReference.campus_id) {
    return { error: 'Sibling reference must belong to the same campus' };
  }

  return {
    is_sibling: true,
    sibling_of_inquiry_id: siblingReference.id,
    sibling_group_id: siblingReference.sibling_group_id || siblingReference.id,
  };
}

// GET /api/inquiries
router.get('/', async (req, res) => {
  try {
    const {
      status, campus_id, class_id, source_id, assigned_staff_id,
      priority, date_from, date_to, search, tag_id,
      gender, area, previous_institute, followup_today, followup_filter,
      is_manual_entry,
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
    if (is_manual_entry !== undefined && is_manual_entry !== null && is_manual_entry !== '') {
      const manualValues = String(is_manual_entry)
        .split(',')
        .map((item) => parseNullableBoolean(item))
        .filter((item) => item !== null);
      if (manualValues.length === 1) {
        where.is_manual_entry = manualValues[0];
      } else if (manualValues.length > 1) {
        where.is_manual_entry = { [Op.in]: manualValues };
      }
    }
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
    const hasStatusFilter = Boolean(status);

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
    if ((followup_filter || followup_today === 'true' || followup_today === '1') && !hasStatusFilter) {
      where.status = { [Op.in]: ACTIVE_INQUIRY_STATUSES };
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
      status: { [Op.in]: ACTIVE_INQUIRY_STATUSES },
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
    const today = todayDateOnly();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const baseWhere = {
      deleted_at: null,
      ...req.campusScope,
      status: { [Op.in]: ACTIVE_INQUIRY_STATUSES },
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

    // Previously overdue but currently recovered (not currently overdue anymore)
    const previouslyOverdue = await Inquiry.findAll({
      where: {
        ...baseWhere,
        was_ever_overdue: true,
        [Op.or]: [
          { next_follow_up_date: null },
          { next_follow_up_date: { [Op.gte]: today } },
        ],
      },
      include,
      order: [
        [sequelize.literal('"Inquiry"."overdue_last_resolved_at" IS NULL'), 'ASC'],
        ['overdue_last_resolved_at', 'DESC'],
        ['updated_at', 'DESC'],
      ],
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

    res.json({ dueToday, overdue, previouslyOverdue, noActivity });
  } catch (error) {
    console.error('Reminders error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/inquiries/sibling-search
router.get('/sibling-search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const requestedCampusId = Number.parseInt(req.query.campus_id, 10);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 25);

    const where = {
      deleted_at: null,
      ...req.campusScope,
    };
    await applyCampusTypeScope(req, where);

    if (Number.isInteger(requestedCampusId) && req.user.role === 'super_admin') {
      where.campus_id = requestedCampusId;
    }

    if (q) {
      where[Op.or] = [
        { student_name: { [Op.iLike]: `%${q}%` } },
        { parent_name: { [Op.iLike]: `%${q}%` } },
        { parent_phone: { [Op.iLike]: `%${q}%` } },
        { student_phone: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const rows = await Inquiry.findAll({
      where,
      attributes: [
        'id',
        'student_name',
        'parent_name',
        'parent_phone',
        'student_phone',
        'class_applying_id',
        'campus_id',
        'is_sibling',
        'sibling_of_inquiry_id',
        'sibling_group_id',
      ],
      include: [
        { model: Campus, as: 'campus', attributes: ['id', 'name', 'campus_type'] },
        { model: ClassLevel, as: 'classApplying', attributes: ['id', 'name'] },
      ],
      order: [['updated_at', 'DESC']],
      limit,
    });

    res.json(rows);
  } catch (error) {
    console.error('Sibling search error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/inquiries/:id
router.get('/:id', async (req, res) => {
  try {
    const includeHistory = String(req.query.include_history || 'true').toLowerCase() !== 'false';
    const inquiry = await Inquiry.findOne({
      where: { id: req.params.id, deleted_at: null },
      include: [
        { model: Campus, as: 'campus' },
        { model: ClassLevel, as: 'classApplying' },
        { model: InquirySource, as: 'source' },
        { model: Inquiry, as: 'siblingOf', attributes: ['id', 'student_name', 'parent_name', 'parent_phone', 'class_applying_id', 'campus_id'] },
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

    const payload = inquiry.toJSON();
    const responseData = {
      ...payload,
      created_at: payload.created_at || payload.createdAt || null,
      updated_at: payload.updated_at || payload.updatedAt || null,
      followUps: Array.isArray(payload.followUps)
        ? payload.followUps.map((item) => ({
          ...item,
          created_at: item.created_at || item.createdAt || null,
          updated_at: item.updated_at || item.updatedAt || null,
        }))
        : [],
    };

    const siblingGroupSeed = payload.sibling_group_id
      || payload.sibling_of_inquiry_id
      || null;
    const siblingWhere = {
      deleted_at: null,
      id: { [Op.ne]: inquiry.id },
      ...req.campusScope,
      [Op.or]: [
        { sibling_of_inquiry_id: inquiry.id },
        ...(siblingGroupSeed ? [{ sibling_group_id: siblingGroupSeed }] : []),
      ],
    };
    const linkedSiblings = await Inquiry.findAll({
      where: siblingWhere,
      attributes: [
        'id',
        'student_name',
        'parent_name',
        'parent_phone',
        'campus_id',
        'class_applying_id',
        'is_sibling',
        'sibling_of_inquiry_id',
        'sibling_group_id',
      ],
      include: [
        { model: Campus, as: 'campus', attributes: ['id', 'name', 'campus_type'] },
        { model: ClassLevel, as: 'classApplying', attributes: ['id', 'name'] },
      ],
      order: [['updated_at', 'DESC']],
      limit: 20,
    });
    responseData.linked_siblings = linkedSiblings;

    if (includeHistory) {
      const historyRows = await AuditLog.findAll({
        where: { entity_type: 'inquiry', entity_id: inquiry.id },
        attributes: ['id', 'action', 'entity_id', 'old_values', 'new_values', 'created_at', 'user_id'],
        include: [{ model: User, as: 'user', attributes: ['id', 'name'], required: false }],
        order: [['created_at', 'DESC']],
      });

      responseData.change_history = historyRows.map((entry) => {
        const row = entry.toJSON();
        return {
          id: row.id,
          action: row.action,
          old_values: row.old_values || null,
          new_values: row.new_values || null,
          created_at: row.created_at || row.createdAt || null,
          user_id: row.user_id,
          user: row.user || null,
        };
      });

      const followUpIds = responseData.followUps.map((fu) => fu.id).filter(Boolean);
      if (followUpIds.length > 0) {
        const followUpHistoryRows = await AuditLog.findAll({
          where: {
            entity_type: 'follow_up',
            entity_id: { [Op.in]: followUpIds },
          },
          attributes: ['id', 'action', 'entity_id', 'old_values', 'new_values', 'created_at', 'user_id'],
          include: [{ model: User, as: 'user', attributes: ['id', 'name'], required: false }],
          order: [['created_at', 'DESC']],
        });

        const historyByFollowUpId = new Map();
        followUpHistoryRows.forEach((entry) => {
          const row = entry.toJSON();
          const list = historyByFollowUpId.get(row.entity_id) || [];
          list.push({
            id: row.id,
            action: row.action,
            old_values: row.old_values || null,
            new_values: row.new_values || null,
            created_at: row.created_at || row.createdAt || null,
            user_id: row.user_id,
            user: row.user || null,
          });
          historyByFollowUpId.set(row.entity_id, list);
        });

        responseData.followUps = responseData.followUps.map((followUp) => {
          const history = historyByFollowUpId.get(followUp.id) || [];
          return {
            ...followUp,
            change_history: history.length ? history : [buildLegacyFollowUpHistoryEntry(followUp)],
          };
        });
      }
    }

    res.json(responseData);
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
      special_needs, inquiry_date, source_id, referral_parent_name, package_name, package_amount, inquiry_form_taken,
      campus_id, session_preference, assigned_staff_id, priority, interest_level, next_follow_up_date, notes, tag_ids,
      is_sibling, sibling_of_inquiry_id, is_manual_entry,
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
    let normalizedParentPhone = normalizePhoneValue(
      isCollegeFlow ? (parent_phone || student_phone || null) : parent_phone
    );
    const normalizedStudentPhone = normalizePhoneValue(student_phone);
    const normalizedParentWhatsapp = normalizePhoneValue(parent_whatsapp);
    const normalizedRelationship = relationship || (isCollegeFlow ? 'other' : 'father');

    if (isFutureDateOnly(inquiry_date)) {
      return res.status(400).json({ error: 'Inquiry date cannot be in the future' });
    }

    if (!isCollegeFlow) {
      if (!normalizedParentPhone) {
        return res.status(400).json({ error: 'Parent phone is required for school inquiries' });
      }
      if (!isValidPhoneNumber(normalizedParentPhone)) {
        return res.status(400).json({ error: 'Parent phone must be exactly 11 digits' });
      }
    } else {
      if (!normalizedParentPhone && !normalizedStudentPhone) {
        return res.status(400).json({ error: 'At least one phone number (parent or student) is required' });
      }
      if (normalizedParentPhone && !isValidPhoneNumber(normalizedParentPhone)) {
        return res.status(400).json({ error: 'Parent phone must be exactly 11 digits' });
      }
      if (!normalizedParentPhone && normalizedStudentPhone) {
        normalizedParentPhone = normalizedStudentPhone;
      }
    }

    if (normalizedStudentPhone && !isValidPhoneNumber(normalizedStudentPhone)) {
      return res.status(400).json({ error: 'Student phone must be exactly 11 digits' });
    }
    if (normalizedParentWhatsapp && !isValidPhoneNumber(normalizedParentWhatsapp)) {
      return res.status(400).json({ error: 'WhatsApp number must be exactly 11 digits' });
    }

    let normalizedAssignedStaffId = null;
    if (assigned_staff_id) {
      const validation = await validateAssignedStaff(req, assigned_staff_id, assignedCampus);
      if (validation?.error) {
        return res.status(400).json({ error: validation.error });
      }
      normalizedAssignedStaffId = validation.id;
    }

    const siblingLink = await resolveSiblingLink(req, {
      isSiblingInput: is_sibling,
      siblingOfInquiryIdInput: sibling_of_inquiry_id,
      campusIdInput: assignedCampus,
    });
    if (siblingLink?.error) {
      return res.status(400).json({ error: siblingLink.error });
    }

    let inquiryPayload = {
      parent_name: normalizedParentName,
      relationship: normalizedRelationship,
      parent_phone: normalizedParentPhone,
      parent_whatsapp: normalizedParentWhatsapp,
      parent_email,
      city, area, student_name, date_of_birth, gender, student_phone: normalizedStudentPhone, class_applying_id,
      current_school, previous_institute, previous_marks_obtained, previous_total_marks, previous_major_subjects,
      special_needs,
      inquiry_date: inquiry_date || new Date().toISOString().split('T')[0],
      source_id, referral_parent_name, package_name, package_amount,
      inquiry_form_taken: parseNullableBoolean(inquiry_form_taken),
      campus_id: assignedCampus,
      session_preference,
      assigned_staff_id: normalizedAssignedStaffId,
      priority,
      interest_level,
      next_follow_up_date: next_follow_up_date || null,
      is_sibling: siblingLink.is_sibling,
      sibling_of_inquiry_id: siblingLink.sibling_of_inquiry_id,
      sibling_group_id: siblingLink.sibling_group_id,
      is_manual_entry: parseNullableBoolean(is_manual_entry) === true,
      notes, status: 'new',
      created_by: req.user.id,
    };
    inquiryPayload = applyOverdueTracking({
      status: 'new',
      next_follow_up_date: null,
      was_ever_overdue: false,
      first_overdue_date: null,
      last_overdue_date: null,
      overdue_resolved_count: 0,
      overdue_last_resolved_at: null,
    }, inquiryPayload);

    const inquiry = await Inquiry.create(inquiryPayload);

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
      new_values: {
        ...pickInquiryAuditState(inquiry),
        tag_ids: Array.isArray(tag_ids) ? [...tag_ids].map(Number).filter(Number.isInteger).sort((a, b) => a - b) : [],
      },
    });

    const created = await Inquiry.findByPk(inquiry.id, {
      include: [
        { model: Campus, as: 'campus' },
        { model: ClassLevel, as: 'classApplying' },
        { model: InquirySource, as: 'source' },
        { model: Inquiry, as: 'siblingOf', attributes: ['id', 'student_name', 'parent_name', 'parent_phone', 'class_applying_id', 'campus_id'] },
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
    const oldTagRows = await InquiryTagMap.findAll({
      where: { inquiry_id: inquiry.id },
      attributes: ['tag_id'],
      raw: true,
    });
    const oldTagIds = oldTagRows
      .map(row => Number.parseInt(row.tag_id, 10))
      .filter(Number.isInteger)
      .sort((a, b) => a - b);
    const { tag_ids, ...updateData } = req.body;
    const targetCampusId = updateData.campus_id !== undefined && updateData.campus_id !== null
      ? updateData.campus_id
      : inquiry.campus_id;
    const campusRecord = await Campus.findOne({
      where: { id: targetCampusId, deleted_at: null, is_active: true },
      attributes: ['id', 'campus_type'],
      raw: true,
    });
    const isCollegeFlow = campusRecord?.campus_type === 'college';
    if (updateData.assigned_staff_id !== undefined && updateData.assigned_staff_id !== null) {
      const validation = await validateAssignedStaff(req, updateData.assigned_staff_id, targetCampusId);
      if (validation?.error) {
        return res.status(400).json({ error: validation.error });
      }
      updateData.assigned_staff_id = validation.id;
    }

    if (
      Object.prototype.hasOwnProperty.call(updateData, 'is_sibling')
      || Object.prototype.hasOwnProperty.call(updateData, 'sibling_of_inquiry_id')
    ) {
      const siblingLink = await resolveSiblingLink(req, {
        isSiblingInput: updateData.is_sibling,
        siblingOfInquiryIdInput: updateData.sibling_of_inquiry_id,
        campusIdInput: targetCampusId,
        currentInquiryId: inquiry.id,
      });
      if (siblingLink?.error) {
        return res.status(400).json({ error: siblingLink.error });
      }
      updateData.is_sibling = siblingLink.is_sibling;
      updateData.sibling_of_inquiry_id = siblingLink.sibling_of_inquiry_id;
      updateData.sibling_group_id = siblingLink.sibling_group_id;
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
    if (updateData.inquiry_date && isFutureDateOnly(updateData.inquiry_date)) {
      return res.status(400).json({ error: 'Inquiry date cannot be in the future' });
    }
    const hasParentPhoneUpdate = Object.prototype.hasOwnProperty.call(updateData, 'parent_phone');
    const hasStudentPhoneUpdate = Object.prototype.hasOwnProperty.call(updateData, 'student_phone');
    const hasWhatsappUpdate = Object.prototype.hasOwnProperty.call(updateData, 'parent_whatsapp');
    if (hasParentPhoneUpdate) {
      updateData.parent_phone = normalizePhoneValue(updateData.parent_phone);
    }
    if (hasStudentPhoneUpdate) {
      updateData.student_phone = normalizePhoneValue(updateData.student_phone);
    }
    if (hasWhatsappUpdate) {
      updateData.parent_whatsapp = normalizePhoneValue(updateData.parent_whatsapp);
    }
    if (hasParentPhoneUpdate || hasStudentPhoneUpdate || hasWhatsappUpdate) {
      const effectiveParentPhone = hasParentPhoneUpdate ? updateData.parent_phone : inquiry.parent_phone;
      const effectiveStudentPhone = hasStudentPhoneUpdate ? updateData.student_phone : inquiry.student_phone;
      const effectiveWhatsapp = hasWhatsappUpdate ? updateData.parent_whatsapp : inquiry.parent_whatsapp;

      if (!isCollegeFlow) {
        if (!effectiveParentPhone) {
          return res.status(400).json({ error: 'Parent phone is required for school inquiries' });
        }
        if (!isValidPhoneNumber(effectiveParentPhone)) {
          return res.status(400).json({ error: 'Parent phone must be exactly 11 digits' });
        }
      } else {
        if (!effectiveParentPhone && !effectiveStudentPhone) {
          return res.status(400).json({ error: 'At least one phone number (parent or student) is required' });
        }
        if (effectiveParentPhone && !isValidPhoneNumber(effectiveParentPhone)) {
          return res.status(400).json({ error: 'Parent phone must be exactly 11 digits' });
        }
        if (!effectiveParentPhone && effectiveStudentPhone && hasParentPhoneUpdate) {
          updateData.parent_phone = effectiveStudentPhone;
        }
      }

      if (effectiveStudentPhone && !isValidPhoneNumber(effectiveStudentPhone)) {
        return res.status(400).json({ error: 'Student phone must be exactly 11 digits' });
      }
      if (effectiveWhatsapp && !isValidPhoneNumber(effectiveWhatsapp)) {
        return res.status(400).json({ error: 'WhatsApp number must be exactly 11 digits' });
      }
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'inquiry_form_taken')) {
      updateData.inquiry_form_taken = parseNullableBoolean(updateData.inquiry_form_taken);
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'is_manual_entry')) {
      updateData.is_manual_entry = parseNullableBoolean(updateData.is_manual_entry) === true;
    }

    updateData.updated_by = req.user.id;
    const trackedUpdateData = applyOverdueTracking(inquiry, updateData);
    await inquiry.update(trackedUpdateData);

    // Update tags if provided
    if (tag_ids !== undefined) {
      await InquiryTagMap.destroy({ where: { inquiry_id: inquiry.id } });
      if (tag_ids.length > 0) {
        await InquiryTagMap.bulkCreate(
          tag_ids.map(tag_id => ({ inquiry_id: inquiry.id, tag_id }))
        );
      }
    }

    const updated = await Inquiry.findByPk(inquiry.id, {
      include: [
        { model: Campus, as: 'campus' },
        { model: ClassLevel, as: 'classApplying' },
        { model: InquirySource, as: 'source' },
        { model: Inquiry, as: 'siblingOf', attributes: ['id', 'student_name', 'parent_name', 'parent_phone', 'class_applying_id', 'campus_id'] },
        { model: User, as: 'assignedStaff', attributes: ['id', 'name'] },
        { model: InquiryTag, as: 'tags', through: { attributes: [] } },
      ],
    });

    const oldState = {
      ...pickInquiryAuditState(oldValues),
      tag_ids: oldTagIds,
    };
    const newTagIds = (updated?.tags || [])
      .map(tag => Number.parseInt(tag.id, 10))
      .filter(Number.isInteger)
      .sort((a, b) => a - b);
    const newState = {
      ...pickInquiryAuditState(updated),
      tag_ids: newTagIds,
    };

    await AuditLog.create({
      user_id: req.user.id,
      action: 'inquiry.update',
      entity_type: 'inquiry',
      entity_id: inquiry.id,
      old_values: oldState,
      new_values: {
        ...newState,
        changed_fields: buildChangedFields(oldState, newState),
      },
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
    const statusUpdateData = applyOverdueTracking(inquiry, {
      status,
      status_changed_at: new Date(),
      notes: notes || inquiry.notes,
      updated_by: req.user.id,
    });
    await inquiry.update(statusUpdateData);

    await AuditLog.create({
      user_id: req.user.id,
      action: 'inquiry.status_change',
      entity_type: 'inquiry',
      entity_id: inquiry.id,
      old_values: { status: oldStatus },
      new_values: {
        status,
        changed_fields: { status: { from: oldStatus, to: status } },
      },
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
      new_values: {
        assigned_staff_id: normalizedAssignedStaffId,
        changed_fields: {
          assigned_staff_id: { from: oldStaff, to: normalizedAssignedStaffId },
        },
      },
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
