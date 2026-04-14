import { Router } from 'express';
import { Op } from 'sequelize';
import {
  Inquiry, InquiryFollowUp, InquirySource, User, AuditLog, Campus, ClassLevel, sequelize,
} from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { authorize, scopeToCampus } from '../middleware/authorize.js';
import { ACTIVE_INQUIRY_STATUSES, todayDateOnly } from '../utils/overdueTracking.js';

const router = Router();
const VALID_CAMPUS_TYPES = ['school', 'college'];
const STAFF_ROLE_SCOPE = ['super_admin', 'admin', 'staff'];

router.use(authenticate);
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

function inquiryIncludeForScope(inquiryWhere, attributes = []) {
  return {
    model: Inquiry,
    as: 'inquiry',
    attributes,
    where: inquiryWhere,
    required: true,
  };
}

function numberOrZero(value) {
  return Number.parseInt(value, 10) || 0;
}

function emptyDisciplineRow(id, name) {
  return {
    id,
    discipline: name,
    inquiryBoys: 0,
    inquiryGirls: 0,
    inquiryToday: 0,
    inquiryToDate: 0,
    formBoys: 0,
    formGirls: 0,
    formTodayPaid: 0,
    formToDatePaid: 0,
    formToDateUnpaid: 0,
    admissionBoys: 0,
    admissionGirls: 0,
    admissionToday: 0,
    admissionToDate: 0,
    inquiryFileERP: 0,
    inquiryFileSoftW: 0,
    followUpTodayInfoInq: 0,
    followUpTodaySchData: 0,
    followUpToDate: 0,
    admissionFileBoys: 0,
    admissionFileGirls: 0,
  };
}

// GET /api/dashboard/admission-stats
router.get('/admission-stats', async (req, res) => {
  try {
    const where = await buildInquiryWhere(req);
    const campusType = req.query.campus_type;
    if (req.user.role === 'staff') {
      where.assigned_staff_id = req.user.id;
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    // Total inquiries
    const totalInquiries = await Inquiry.count({ where });

    // This month
    const thisMonthWhere = { ...where, inquiry_date: { [Op.gte]: startOfMonth } };
    const thisMonth = await Inquiry.count({ where: thisMonthWhere });

    // Today
    const todayCount = await Inquiry.count({
      where: { ...where, inquiry_date: today },
    });

    // By status
    const byStatus = await Inquiry.findAll({
      where,
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('Inquiry.id')), 'count']],
      group: ['status'],
      raw: true,
    });

    // Conversion rate this month
    const admittedThisMonth = await Inquiry.count({
      where: { ...thisMonthWhere, status: 'admitted' },
    });
    const conversionRate = thisMonth > 0 ? ((admittedThisMonth / thisMonth) * 100).toFixed(1) : 0;

    // By source with campus-type breakdown (for source-level hover details in dashboard)
    const bySourceRaw = await Inquiry.findAll({
      where,
      attributes: [
        [sequelize.literal(`COALESCE("source"."name", 'Unknown')`), 'source_name'],
        [sequelize.col('campus.campus_type'), 'campus_type'],
        [sequelize.fn('COUNT', sequelize.col('Inquiry.id')), 'count'],
      ],
      include: [
        { model: InquirySource, as: 'source', attributes: [], required: false },
        { model: Campus, as: 'campus', attributes: [], required: false },
      ],
      group: [sequelize.col('source.name'), sequelize.col('campus.campus_type')],
      raw: true,
    });

    const sourceMap = new Map();
    bySourceRaw.forEach((row) => {
      const sourceName = row.source_name || 'Unknown';
      const campusTypeKey = row.campus_type === 'college'
        ? 'college'
        : row.campus_type === 'school'
          ? 'school'
          : 'unknown';
      const count = numberOrZero(row.count);

      if (!sourceMap.has(sourceName)) {
        sourceMap.set(sourceName, {
          name: sourceName,
          count: 0,
          schoolCount: 0,
          collegeCount: 0,
          unknownCount: 0,
        });
      }

      const entry = sourceMap.get(sourceName);
      entry.count += count;
      if (campusTypeKey === 'school') entry.schoolCount += count;
      if (campusTypeKey === 'college') entry.collegeCount += count;
      if (campusTypeKey === 'unknown') entry.unknownCount += count;
    });

    const bySourceDetailed = Array.from(sourceMap.values())
      .sort((a, b) => b.count - a.count)
      .map(entry => ({
        name: entry.name,
        count: entry.count,
        breakdown: {
          school: entry.schoolCount,
          college: entry.collegeCount,
          unknown: entry.unknownCount,
        },
      }));

    const studentWhere = {
      deleted_at: null,
      is_active: true,
      role: 'student',
      ...req.campusScope,
    };
    if (req.user.role === 'super_admin' && VALID_CAMPUS_TYPES.includes(campusType)) {
      const campuses = await Campus.findAll({
        where: { deleted_at: null, is_active: true, campus_type: campusType },
        attributes: ['id'],
        raw: true,
      });
      const campusIds = campuses.map(c => c.id);
      studentWhere.campus_id = campusIds.length ? { [Op.in]: campusIds } : -1;
    }
    const totalStudents = await User.count({ where: studentWhere });

    res.json({
      totalInquiries,
      totalStudents,
      thisMonth,
      todayCount,
      conversionRate: parseFloat(conversionRate),
      byStatus,
      bySource: bySourceDetailed.map(s => ({ name: s.name, count: s.count })),
      bySourceDetailed,
    });
  } catch (error) {
    console.error('Admission stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/dashboard/complete-report
router.get('/complete-report', authorize('super_admin', 'admin', 'staff'), async (req, res) => {
  try {
    const inquiryWhere = await buildInquiryWhere(req);
    if (req.user.role === 'staff') {
      inquiryWhere.assigned_staff_id = req.user.id;
    }

    const campusType = req.query.campus_type;
    const today = new Date().toISOString().split('T')[0];
    const sessionStart = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const sessionLabel = `${sessionStart}-${String(sessionStart + 1).slice(-2)}`;

    let scopedCampusIds = [];
    if (req.user.role === 'super_admin' && VALID_CAMPUS_TYPES.includes(campusType)) {
      const campuses = await Campus.findAll({
        where: { deleted_at: null, is_active: true, campus_type: campusType },
        attributes: ['id'],
        raw: true,
      });
      scopedCampusIds = campuses.map(c => c.id);
    } else if (req.user.role === 'super_admin') {
      const campuses = await Campus.findAll({
        where: { deleted_at: null, is_active: true },
        attributes: ['id'],
        raw: true,
      });
      scopedCampusIds = campuses.map(c => c.id);
    } else if (req.user.campus_id) {
      scopedCampusIds = [req.user.campus_id];
    }

    const classWhere = { is_active: true };
    if (scopedCampusIds.length) {
      classWhere[Op.or] = [
        { campus_id: { [Op.in]: scopedCampusIds } },
        { campus_id: null },
      ];
    } else if (req.user.role === 'super_admin' && VALID_CAMPUS_TYPES.includes(campusType)) {
      classWhere.campus_id = -1;
    }

    const classLevels = await ClassLevel.findAll({
      where: classWhere,
      attributes: ['id', 'name', 'sort_order'],
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
      raw: true,
    });

    const rowsByClass = new Map();
    classLevels.forEach((cls) => rowsByClass.set(cls.id, emptyDisciplineRow(cls.id, cls.name)));

    const inquiries = await Inquiry.findAll({
      where: inquiryWhere,
      attributes: ['id', 'class_applying_id', 'gender', 'inquiry_date', 'status', 'package_amount'],
      include: [
        { model: ClassLevel, as: 'classApplying', attributes: ['id', 'name'] },
        { model: InquirySource, as: 'source', attributes: ['id', 'name'] },
      ],
      order: [['inquiry_date', 'ASC']],
    });

    const FORM_ACQUISITION_STATUSES = new Set(['form_issued', 'form_submitted', 'documents_pending', 'admitted']);
    const ADMISSION_FILE_STATUSES = new Set(['form_issued', 'form_submitted', 'documents_pending']);

    for (const inquiry of inquiries) {
      const classId = inquiry.class_applying_id || inquiry.classApplying?.id;
      if (!classId) continue;

      if (!rowsByClass.has(classId)) {
        rowsByClass.set(classId, emptyDisciplineRow(classId, inquiry.classApplying?.name || `Discipline ${classId}`));
      }

      const row = rowsByClass.get(classId);
      const inquiryDate = inquiry.inquiry_date ? String(inquiry.inquiry_date).slice(0, 10) : null;
      const isToday = inquiryDate === today;
      const gender = inquiry.gender;
      const status = inquiry.status;
      const sourceName = String(inquiry.source?.name || '').toLowerCase();
      const packageAmount = Number(inquiry.package_amount || 0);
      const isPaid = status === 'admitted' || packageAmount > 0;

      row.inquiryToDate += 1;
      if (isToday) row.inquiryToday += 1;
      if (gender === 'male') row.inquiryBoys += 1;
      if (gender === 'female') row.inquiryGirls += 1;

      if (FORM_ACQUISITION_STATUSES.has(status)) {
        if (gender === 'male') row.formBoys += 1;
        if (gender === 'female') row.formGirls += 1;
        if (isPaid) {
          row.formToDatePaid += 1;
          if (isToday) row.formTodayPaid += 1;
        }
        if (sourceName.includes('erp')) row.inquiryFileERP += 1;
        if (sourceName.includes('soft')) row.inquiryFileSoftW += 1;
      }

      if (status === 'admitted') {
        row.admissionToDate += 1;
        if (isToday) row.admissionToday += 1;
        if (gender === 'male') row.admissionBoys += 1;
        if (gender === 'female') row.admissionGirls += 1;
      }

      if (ADMISSION_FILE_STATUSES.has(status)) {
        if (gender === 'male') row.admissionFileBoys += 1;
        if (gender === 'female') row.admissionFileGirls += 1;
      }
    }

    rowsByClass.forEach((row) => {
      const acquired = row.formBoys + row.formGirls;
      row.formToDateUnpaid = Math.max(acquired - row.formToDatePaid, 0);
    });

    const followUps = await InquiryFollowUp.findAll({
      attributes: ['id', 'inquiry_id', 'follow_up_date', 'type'],
      include: [{
        model: Inquiry,
        as: 'inquiry',
        attributes: ['class_applying_id'],
        where: inquiryWhere,
        required: true,
      }],
      order: [['follow_up_date', 'ASC']],
    });

    for (const followUp of followUps) {
      const classId = followUp.inquiry?.class_applying_id;
      if (!classId || !rowsByClass.has(classId)) continue;
      const row = rowsByClass.get(classId);
      const followUpDate = followUp.follow_up_date ? String(followUp.follow_up_date).slice(0, 10) : null;
      const isToday = followUpDate === today;

      row.followUpToDate += 1;
      if (isToday) {
        if (followUp.type === 'outgoing_call' || followUp.type === 'incoming_call') {
          row.followUpTodayInfoInq += 1;
        } else {
          row.followUpTodaySchData += 1;
        }
      }
    }

    const rows = Array.from(rowsByClass.values());

    const totals = rows.reduce((acc, row) => {
      Object.keys(acc).forEach((key) => {
        if (key === 'discipline') return;
        acc[key] += numberOrZero(row[key]);
      });
      return acc;
    }, {
      discipline: 'GRAND TOTAL',
      inquiryBoys: 0,
      inquiryGirls: 0,
      inquiryToday: 0,
      inquiryToDate: 0,
      formBoys: 0,
      formGirls: 0,
      formTodayPaid: 0,
      formToDatePaid: 0,
      formToDateUnpaid: 0,
      admissionBoys: 0,
      admissionGirls: 0,
      admissionToday: 0,
      admissionToDate: 0,
      inquiryFileERP: 0,
      inquiryFileSoftW: 0,
      followUpTodayInfoInq: 0,
      followUpTodaySchData: 0,
      followUpToDate: 0,
      admissionFileBoys: 0,
      admissionFileGirls: 0,
    });

    res.json({
      generatedAt: new Date().toISOString(),
      scope: req.user.role === 'super_admin'
        ? (VALID_CAMPUS_TYPES.includes(campusType) ? campusType : 'all')
        : (req.user.campus?.campus_type || 'school'),
      sessionLabel,
      rows,
      totals,
      signatures: {
        informationOfficer: '',
        admissionCoordinator: '',
        principal: '',
      },
    });
  } catch (error) {
    console.error('Complete report error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/dashboard/follow-up-stats
router.get('/follow-up-stats', async (req, res) => {
  try {
    const today = todayDateOnly();
    const baseWhere = await buildInquiryWhere(req);
    if (req.user.role === 'staff') {
      baseWhere.assigned_staff_id = req.user.id;
    }

    const activeStatuses = { [Op.in]: ACTIVE_INQUIRY_STATUSES };

    const dueToday = await Inquiry.count({
      where: { ...baseWhere, next_follow_up_date: today, status: activeStatuses },
    });

    const overdue = await Inquiry.count({
      where: {
        ...baseWhere,
        next_follow_up_date: { [Op.lt]: today, [Op.ne]: null },
        status: activeStatuses,
      },
    });

    const historicallyOverdue = await Inquiry.count({
      where: {
        ...baseWhere,
        was_ever_overdue: true,
      },
    });

    const recoveredOverdue = await Inquiry.count({
      where: {
        ...baseWhere,
        status: activeStatuses,
        was_ever_overdue: true,
        [Op.or]: [
          { next_follow_up_date: null },
          { next_follow_up_date: { [Op.gte]: today } },
        ],
      },
    });

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const staffRoleUsers = await User.findAll({
      where: {
        deleted_at: null,
        is_active: true,
        role: { [Op.in]: STAFF_ROLE_SCOPE },
      },
      attributes: ['id'],
      raw: true,
    });
    const staffRoleIds = staffRoleUsers.map(u => u.id);
    const scopedStaffId = req.user.role === 'staff'
      ? req.user.id
      : (staffRoleIds.length ? { [Op.in]: staffRoleIds } : -1);

    const completedThisMonth = await InquiryFollowUp.count({
      where: {
        created_at: { [Op.gte]: startOfMonth },
        staff_id: scopedStaffId,
      },
      include: [inquiryIncludeForScope(baseWhere)],
      distinct: true,
    });

    const recoveredOverdueThisMonth = await Inquiry.count({
      where: {
        ...baseWhere,
        was_ever_overdue: true,
        overdue_last_resolved_at: { [Op.gte]: startOfMonth },
      },
    });

    res.json({
      dueToday,
      overdue,
      completedThisMonth,
      historicallyOverdue,
      recoveredOverdue,
      recoveredOverdueThisMonth,
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/dashboard/staff-performance
router.get('/staff-performance', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const staffWhere = {
      deleted_at: null,
      is_active: true,
      role: { [Op.in]: STAFF_ROLE_SCOPE },
      ...req.campusScope,
    };
    const inquiryWhere = await buildInquiryWhere(req);
    const campusType = req.query.campus_type;

    const campusInclude = {
      model: Campus,
      as: 'campus',
      attributes: ['id', 'name', 'campus_type'],
      required: false,
    };

    const staff = await User.findAll({
      where: staffWhere,
      attributes: ['id', 'name', 'role'],
      include: [campusInclude],
    });
    const scopedStaff = req.user.role === 'super_admin' && VALID_CAMPUS_TYPES.includes(campusType)
      ? staff.filter(s => s.role === 'super_admin' || s.campus?.campus_type === campusType)
      : staff;

    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const performance = await Promise.all(scopedStaff.map(async (s) => {
      const totalInquiries = await Inquiry.count({
        where: { ...inquiryWhere, assigned_staff_id: s.id },
      });

      const admittedCount = await Inquiry.count({
        where: { ...inquiryWhere, assigned_staff_id: s.id, status: 'admitted' },
      });

      const followUpsThisMonth = await InquiryFollowUp.count({
        where: { staff_id: s.id, created_at: { [Op.gte]: startOfMonth } },
        include: [inquiryIncludeForScope({ ...inquiryWhere, assigned_staff_id: s.id })],
        distinct: true,
      });

      const followUpsToday = await InquiryFollowUp.count({
        where: {
          staff_id: s.id,
          created_at: {
            [Op.gte]: new Date(today),
            [Op.lt]: new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000),
          },
        },
        include: [inquiryIncludeForScope({ ...inquiryWhere, assigned_staff_id: s.id })],
        distinct: true,
      });

      return {
        id: s.id,
        name: s.name,
        role: s.role,
        totalInquiries,
        admittedCount,
        conversionRate: totalInquiries > 0 ? ((admittedCount / totalInquiries) * 100).toFixed(1) : 0,
        followUpsThisMonth,
        followUpsToday,
      };
    }));

    res.json(performance);
  } catch (error) {
    console.error('Staff performance error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/dashboard/communication-stats
router.get('/communication-stats', async (req, res) => {
  try {
    const where = await buildInquiryWhere(req);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
    const staffRoleUsers = await User.findAll({
      where: {
        deleted_at: null,
        is_active: true,
        role: { [Op.in]: STAFF_ROLE_SCOPE },
      },
      attributes: ['id'],
      raw: true,
    });
    const staffRoleIds = staffRoleUsers.map(u => u.id);
    const staffRoleWhere = staffRoleIds.length ? { [Op.in]: staffRoleIds } : -1;

    // Total active inquiries (not closed)
    const activeStatuses = ACTIVE_INQUIRY_STATUSES;
    const totalActive = await Inquiry.count({ where: { ...where, status: { [Op.in]: activeStatuses } } });

    // Contacted (have at least 1 follow-up)
    const contacted = await Inquiry.count({
      where: { ...where, status: { [Op.in]: activeStatuses }, last_contact_date: { [Op.ne]: null } },
    });

    // Not contacted (no follow-up yet)
    const notContacted = await Inquiry.count({
      where: {
        ...where,
        status: { [Op.in]: activeStatuses },
        [Op.or]: [{ last_contact_date: null }],
      },
    });

    // Contact rate
    const contactRate = totalActive > 0 ? ((contacted / totalActive) * 100).toFixed(1) : 0;

    // Follow-ups this month
    const followUpsThisMonth = await InquiryFollowUp.count({
      where: { created_at: { [Op.gte]: startOfMonth }, staff_id: staffRoleWhere },
      include: [inquiryIncludeForScope(where)],
      distinct: true,
    });

    // Follow-ups last month
    const followUpsLastMonth = await InquiryFollowUp.count({
      where: {
        created_at: { [Op.gte]: startOfLastMonth, [Op.lte]: endOfLastMonth },
        staff_id: staffRoleWhere,
      },
      include: [inquiryIncludeForScope(where)],
      distinct: true,
    });

    // By communication type this month
    const byType = await InquiryFollowUp.findAll({
      where: { created_at: { [Op.gte]: startOfMonth }, staff_id: staffRoleWhere },
      attributes: ['type', [sequelize.fn('COUNT', sequelize.col('InquiryFollowUp.id')), 'count']],
      include: [inquiryIncludeForScope(where)],
      group: ['type'],
      raw: true,
    });

    // Daily follow-ups for last 14 days
    const dailyData = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const dayStart = new Date(dayStr);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const count = await InquiryFollowUp.count({
        where: { follow_up_date: dayStr, staff_id: staffRoleWhere },
        include: [inquiryIncludeForScope(where)],
        distinct: true,
      });
      dailyData.push({
        date: dayStr,
        day: d.toLocaleDateString('en', { weekday: 'short', day: 'numeric' }),
        count,
      });
    }

    // Staff communication breakdown
    const staffComms = await InquiryFollowUp.findAll({
      where: { created_at: { [Op.gte]: startOfMonth }, staff_id: staffRoleWhere },
      attributes: ['staff_id', [sequelize.fn('COUNT', sequelize.col('InquiryFollowUp.id')), 'count']],
      include: [
        {
          model: User,
          as: 'staff',
          attributes: ['name'],
          where: { role: { [Op.in]: STAFF_ROLE_SCOPE } },
          required: true,
        },
        inquiryIncludeForScope(where),
      ],
      group: ['staff_id', 'staff.id', 'staff.name'],
      raw: true,
    });

    res.json({
      totalActive,
      contacted,
      notContacted,
      contactRate: parseFloat(contactRate),
      followUpsThisMonth,
      followUpsLastMonth,
      byType: byType.map(t => ({
        type: t.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        count: parseInt(t.count),
      })),
      dailyData,
      staffComms: staffComms.map(s => ({
        name: s['staff.name'] || 'Unassigned',
        count: parseInt(s.count),
      })),
    });
  } catch (error) {
    console.error('Communication stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/dashboard/recent-activity
router.get('/recent-activity', async (req, res) => {
  try {
    const where = {};
    if (req.user.role === 'staff') {
      where.user_id = req.user.id;
    } else {
      const requestedStaffId = Number.parseInt(req.query.staff_id, 10);
      if (Number.isInteger(requestedStaffId)) {
        where.user_id = requestedStaffId;
      }
    }
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 200)
      : 100;
    const scanLimit = Math.min(Math.max(limit * 5, 100), 1000);
    const inquiryWhere = await buildInquiryWhere(req);

    const activities = await AuditLog.findAll({
      where,
      attributes: ['id', 'action', 'entity_type', 'entity_id', 'old_values', 'new_values', 'created_at', 'user_id'],
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']],
      limit: scanLimit,
    });

    const inquiryEntityIds = [];
    const followUpEntityIds = [];
    activities.forEach((activity) => {
      const item = activity?.toJSON ? activity.toJSON() : activity;
      if (item?.entity_type === 'inquiry' && Number.isInteger(item?.entity_id)) {
        inquiryEntityIds.push(item.entity_id);
      }
      if (item?.entity_type === 'follow_up' && Number.isInteger(item?.entity_id)) {
        followUpEntityIds.push(item.entity_id);
      }
    });

    const allowedInquiryIds = new Set();
    if (inquiryEntityIds.length > 0) {
      const scopedInquiries = await Inquiry.findAll({
        where: {
          ...inquiryWhere,
          id: { [Op.in]: [...new Set(inquiryEntityIds)] },
        },
        attributes: ['id'],
        raw: true,
      });
      scopedInquiries.forEach((row) => allowedInquiryIds.add(row.id));
    }

    const allowedFollowUpIds = new Set();
    if (followUpEntityIds.length > 0) {
      const scopedFollowUps = await InquiryFollowUp.findAll({
        where: { id: { [Op.in]: [...new Set(followUpEntityIds)] } },
        attributes: ['id'],
        include: [inquiryIncludeForScope(inquiryWhere)],
      });
      scopedFollowUps.forEach((row) => allowedFollowUpIds.add(row.id));
    }

    const scopedActivities = activities
      .filter((activity) => {
        const item = activity?.toJSON ? activity.toJSON() : activity;
        if (item?.entity_type === 'inquiry') {
          return allowedInquiryIds.has(item.entity_id);
        }
        if (item?.entity_type === 'follow_up') {
          return allowedFollowUpIds.has(item.entity_id);
        }
        return true;
      })
      .slice(0, limit);

    res.json(scopedActivities);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/dashboard/control-analytics
router.get('/control-analytics', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const inquiryWhere = await buildInquiryWhere(req);
    const today = todayDateOnly();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgoDate = sevenDaysAgo.split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const activeStatuses = ACTIVE_INQUIRY_STATUSES;
    const highRiskTriggers = {
      [Op.or]: [
        { next_follow_up_date: { [Op.lt]: today, [Op.ne]: null } },
        { last_contact_date: { [Op.lt]: sevenDaysAgo } },
        { last_contact_date: null, inquiry_date: { [Op.lt]: sevenDaysAgoDate } },
      ],
    };
    const mediumRiskTriggers = {
      [Op.or]: [
        { next_follow_up_date: { [Op.eq]: today } },
        { last_contact_date: { [Op.gte]: sevenDaysAgo, [Op.lt]: threeDaysAgo } },
      ],
    };
    const activeStatusSql = activeStatuses.map(status => `'${status}'`).join(',');
    const overdueSqlCondition = `"Inquiry"."status" IN (${activeStatusSql}) AND "Inquiry"."next_follow_up_date" < '${today}' AND "Inquiry"."next_follow_up_date" IS NOT NULL`;
    const highRiskTriggerSqlCondition = `
      ${overdueSqlCondition}
      OR "Inquiry"."last_contact_date" < '${sevenDaysAgo}'
      OR ("Inquiry"."last_contact_date" IS NULL AND "Inquiry"."inquiry_date" < '${sevenDaysAgoDate}')
    `;
    const mediumRiskTriggerSqlCondition = `
      "Inquiry"."next_follow_up_date" = '${today}'
      OR ("Inquiry"."last_contact_date" >= '${sevenDaysAgo}' AND "Inquiry"."last_contact_date" < '${threeDaysAgo}')
    `;
    const highRiskSqlCondition = `"Inquiry"."status" IN (${activeStatusSql}) AND (${highRiskTriggerSqlCondition})`;
    const mediumRiskSqlCondition = `"Inquiry"."status" IN (${activeStatusSql}) AND NOT (${highRiskTriggerSqlCondition}) AND (${mediumRiskTriggerSqlCondition})`;
    const recoveredOverdueSqlCondition = `"Inquiry"."status" IN (${activeStatusSql}) AND "Inquiry"."was_ever_overdue" = TRUE AND ("Inquiry"."next_follow_up_date" IS NULL OR "Inquiry"."next_follow_up_date" >= '${today}')`;

    const baseWhere = { ...inquiryWhere, status: { [Op.in]: activeStatuses } };
    const currentOverdueWhere = {
      ...baseWhere,
      next_follow_up_date: { [Op.lt]: today, [Op.ne]: null },
    };
    const recoveredOverdueWhere = {
      ...baseWhere,
      was_ever_overdue: true,
      [Op.or]: [
        { next_follow_up_date: null },
        { next_follow_up_date: { [Op.gte]: today } },
      ],
    };

    const highRiskWhere = {
      ...baseWhere,
      ...highRiskTriggers,
    };

    const mediumRiskWhere = {
      ...baseWhere,
      [Op.and]: [
        { [Op.not]: highRiskTriggers },
        mediumRiskTriggers,
      ],
    };

    const [
      totalInquiries,
      activeInquiries,
      admittedCount,
      overdueCount,
      historicallyOverdueCount,
      recoveredOverdueCount,
      recoveredOverdueThisMonth,
      dueTodayCount,
      unassignedCount,
      highRiskCount,
      mediumRiskCount,
      highRiskList,
      mediumRiskList,
      campusBreakdownRaw,
      overdueInsightsRaw,
      overdueResolutionInsightsRaw,
    ] = await Promise.all([
      Inquiry.count({ where: inquiryWhere }),
      Inquiry.count({ where: baseWhere }),
      Inquiry.count({ where: { ...inquiryWhere, status: 'admitted' } }),
      Inquiry.count({ where: currentOverdueWhere }),
      Inquiry.count({ where: { ...inquiryWhere, was_ever_overdue: true } }),
      Inquiry.count({ where: recoveredOverdueWhere }),
      Inquiry.count({
        where: {
          ...inquiryWhere,
          was_ever_overdue: true,
          overdue_last_resolved_at: { [Op.gte]: startOfMonth },
        },
      }),
      Inquiry.count({ where: { ...baseWhere, next_follow_up_date: today } }),
      Inquiry.count({ where: { ...inquiryWhere, assigned_staff_id: null } }),
      Inquiry.count({ where: highRiskWhere }),
      Inquiry.count({ where: mediumRiskWhere }),
      Inquiry.findAll({
        where: highRiskWhere,
        attributes: ['id', 'student_name', 'parent_name', 'area', 'status', 'next_follow_up_date'],
        include: [{ model: ClassLevel, as: 'classApplying', attributes: ['name'] }],
        order: [['next_follow_up_date', 'ASC'], ['updated_at', 'ASC']],
        limit: 8,
      }),
      Inquiry.findAll({
        where: mediumRiskWhere,
        attributes: ['id', 'student_name', 'parent_name', 'area', 'status', 'next_follow_up_date'],
        include: [{ model: ClassLevel, as: 'classApplying', attributes: ['name'] }],
        order: [['next_follow_up_date', 'ASC'], ['updated_at', 'ASC']],
        limit: 8,
      }),
      Inquiry.findAll({
        where: inquiryWhere,
        attributes: [
          [sequelize.col('campus.campus_type'), 'campus_type'],
          [sequelize.fn('COUNT', sequelize.col('Inquiry.id')), 'total_count'],
          [sequelize.fn('SUM', sequelize.literal(`CASE WHEN "Inquiry"."status" IN (${activeStatusSql}) THEN 1 ELSE 0 END`)), 'active_count'],
          [sequelize.fn('SUM', sequelize.literal(`CASE WHEN ${overdueSqlCondition} THEN 1 ELSE 0 END`)), 'overdue_count'],
          [sequelize.fn('SUM', sequelize.literal('CASE WHEN "Inquiry"."was_ever_overdue" = TRUE THEN 1 ELSE 0 END')), 'historical_overdue_count'],
          [sequelize.fn('SUM', sequelize.literal(`CASE WHEN ${recoveredOverdueSqlCondition} THEN 1 ELSE 0 END`)), 'recovered_overdue_count'],
          [sequelize.fn('SUM', sequelize.literal(`CASE WHEN "Inquiry"."status" IN (${activeStatusSql}) AND "Inquiry"."next_follow_up_date" = '${today}' THEN 1 ELSE 0 END`)), 'due_today_count'],
          [sequelize.fn('SUM', sequelize.literal(`CASE WHEN ${highRiskSqlCondition} THEN 1 ELSE 0 END`)), 'high_risk_count'],
          [sequelize.fn('SUM', sequelize.literal(`CASE WHEN ${mediumRiskSqlCondition} THEN 1 ELSE 0 END`)), 'medium_risk_count'],
        ],
        include: [{ model: Campus, as: 'campus', attributes: [], required: false }],
        group: [sequelize.col('campus.campus_type')],
        raw: true,
      }),
      Inquiry.findOne({
        where: currentOverdueWhere,
        attributes: [
          [sequelize.fn('MIN', sequelize.col('next_follow_up_date')), 'oldest_date'],
          [sequelize.fn('MAX', sequelize.literal(`('${today}'::date - "Inquiry"."next_follow_up_date")`)), 'max_days_overdue'],
          [sequelize.fn('AVG', sequelize.literal(`('${today}'::date - "Inquiry"."next_follow_up_date")`)), 'avg_days_overdue'],
          [sequelize.fn('SUM', sequelize.literal(`CASE WHEN ('${today}'::date - "Inquiry"."next_follow_up_date") BETWEEN 1 AND 3 THEN 1 ELSE 0 END`)), 'age_1_3'],
          [sequelize.fn('SUM', sequelize.literal(`CASE WHEN ('${today}'::date - "Inquiry"."next_follow_up_date") BETWEEN 4 AND 7 THEN 1 ELSE 0 END`)), 'age_4_7'],
          [sequelize.fn('SUM', sequelize.literal(`CASE WHEN ('${today}'::date - "Inquiry"."next_follow_up_date") >= 8 THEN 1 ELSE 0 END`)), 'age_8_plus'],
        ],
        raw: true,
      }),
      Inquiry.findOne({
        where: {
          ...inquiryWhere,
          was_ever_overdue: true,
          overdue_last_resolved_at: { [Op.ne]: null },
        },
        attributes: [
          [sequelize.fn('MAX', sequelize.col('overdue_last_resolved_at')), 'last_resolved_at'],
        ],
        raw: true,
      }),
    ]);

    const classPerformanceRaw = await Inquiry.findAll({
      where: inquiryWhere,
      attributes: [
        'class_applying_id',
        [sequelize.fn('COUNT', sequelize.col('Inquiry.id')), 'total_count'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN \"Inquiry\".\"status\"='admitted' THEN 1 ELSE 0 END")), 'admitted_count'],
        [sequelize.fn('SUM', sequelize.literal(`CASE WHEN "Inquiry"."status" IN (${activeStatusSql}) THEN 1 ELSE 0 END`)), 'active_count'],
        [sequelize.fn('SUM', sequelize.literal(`CASE WHEN "Inquiry"."status" IN (${activeStatusSql}) AND "Inquiry"."next_follow_up_date" < '${today}' AND "Inquiry"."next_follow_up_date" IS NOT NULL THEN 1 ELSE 0 END`)), 'overdue_count'],
      ],
      include: [{ model: ClassLevel, as: 'classApplying', attributes: ['id', 'name'] }],
      group: ['class_applying_id', 'classApplying.id', 'classApplying.name'],
      raw: true,
    });

    const classPerformance = classPerformanceRaw
      .map((row) => {
        const total = numberOrZero(row.total_count);
        const admitted = numberOrZero(row.admitted_count);
        const active = numberOrZero(row.active_count);
        const overdue = numberOrZero(row.overdue_count);
        const conversionRate = total > 0 ? ((admitted / total) * 100).toFixed(1) : '0.0';
        return {
          className: row['classApplying.name'] || 'Unknown',
          total,
          admitted,
          active,
          overdue,
          conversionRate: Number.parseFloat(conversionRate),
        };
      })
      .sort((a, b) => b.total - a.total);

    const staffWhere = {
      deleted_at: null,
      is_active: true,
      role: { [Op.in]: STAFF_ROLE_SCOPE },
      ...req.campusScope,
    };
    const staff = await User.findAll({
      where: staffWhere,
      attributes: ['id', 'name', 'role'],
      order: [['name', 'ASC']],
    });

    const staffControl = await Promise.all(staff.map(async (s) => {
      const assignedTotal = await Inquiry.count({
        where: { ...inquiryWhere, assigned_staff_id: s.id },
      });
      const assignedActive = await Inquiry.count({
        where: { ...baseWhere, assigned_staff_id: s.id },
      });
      const assignedAdmitted = await Inquiry.count({
        where: { ...inquiryWhere, assigned_staff_id: s.id, status: 'admitted' },
      });
      const assignedOverdue = await Inquiry.count({
        where: {
          ...baseWhere,
          assigned_staff_id: s.id,
          next_follow_up_date: { [Op.lt]: today, [Op.ne]: null },
        },
      });
      const followUpsThisMonth = await InquiryFollowUp.count({
        where: {
          staff_id: s.id,
          created_at: { [Op.gte]: startOfMonth },
        },
        include: [inquiryIncludeForScope({ ...inquiryWhere, assigned_staff_id: s.id })],
        distinct: true,
      });

      const conversionRate = assignedTotal > 0 ? ((assignedAdmitted / assignedTotal) * 100) : 0;
      const activityScore = Math.max(0, Math.round((conversionRate * 0.6) + (followUpsThisMonth * 0.8) - (assignedOverdue * 1.5)));

      return {
        id: s.id,
        name: s.name,
        role: s.role,
        totalAssigned: assignedTotal,
        activeAssigned: assignedActive,
        admittedCount: assignedAdmitted,
        overdueCount: assignedOverdue,
        followUpsThisMonth,
        conversionRate: Number.parseFloat(conversionRate.toFixed(1)),
        activityScore,
      };
    }));

    const topAreasRaw = await Inquiry.findAll({
      where: { ...inquiryWhere, area: { [Op.ne]: null } },
      attributes: ['area', [sequelize.fn('COUNT', sequelize.col('Inquiry.id')), 'count']],
      group: ['area'],
      order: [[sequelize.literal('count'), 'DESC']],
      limit: 6,
      raw: true,
    });

    const topSourcesRaw = await Inquiry.findAll({
      where: inquiryWhere,
      attributes: ['source_id', [sequelize.fn('COUNT', sequelize.col('Inquiry.id')), 'count']],
      include: [{ model: InquirySource, as: 'source', attributes: ['name'] }],
      group: ['source_id', 'source.id', 'source.name'],
      order: [[sequelize.literal('count'), 'DESC']],
      limit: 6,
      raw: true,
    });

    const emptyCampusMetrics = {
      totalInquiries: 0,
      activeInquiries: 0,
      lowRiskCount: 0,
      dueTodayCount: 0,
      overdueCount: 0,
      historicalOverdueCount: 0,
      recoveredOverdueCount: 0,
    };
    const campusBreakdown = {
      school: { ...emptyCampusMetrics },
      college: { ...emptyCampusMetrics },
    };
    campusBreakdownRaw.forEach((row) => {
      const type = row.campus_type;
      if (type !== 'school' && type !== 'college') return;
      const activeCount = numberOrZero(row.active_count);
      const highRiskCampus = numberOrZero(row.high_risk_count);
      const mediumRiskCampus = numberOrZero(row.medium_risk_count);
      campusBreakdown[type] = {
        totalInquiries: numberOrZero(row.total_count),
        activeInquiries: activeCount,
        lowRiskCount: Math.max(activeCount - highRiskCampus - mediumRiskCampus, 0),
        dueTodayCount: numberOrZero(row.due_today_count),
        overdueCount: numberOrZero(row.overdue_count),
        historicalOverdueCount: numberOrZero(row.historical_overdue_count),
        recoveredOverdueCount: numberOrZero(row.recovered_overdue_count),
      };
    });

    const averageDaysRaw = Number.parseFloat(overdueInsightsRaw?.avg_days_overdue ?? 0);
    const averageDaysOverdue = Number.isFinite(averageDaysRaw) ? Number.parseFloat(averageDaysRaw.toFixed(1)) : 0;

    res.json({
      overview: {
        totalInquiries,
        activeInquiries,
        admittedCount,
        conversionRate: totalInquiries > 0 ? Number.parseFloat(((admittedCount / totalInquiries) * 100).toFixed(1)) : 0,
        overdueCount,
        historicallyOverdueCount,
        recoveredOverdueCount,
        recoveredOverdueThisMonth,
        dueTodayCount,
        unassignedCount,
        asOfDate: today,
      },
      risk: {
        highCount: highRiskCount,
        mediumCount: mediumRiskCount,
        lowCount: Math.max(activeInquiries - highRiskCount - mediumRiskCount, 0),
        lowDefinition: 'Low Risk = active inquiries with no overdue follow-up, no due-today follow-up, and healthy recent contact progress.',
        highList: highRiskList,
        mediumList: mediumRiskList,
      },
      overdue: {
        asOfDate: today,
        oldestDate: overdueInsightsRaw?.oldest_date || null,
        oldestDaysOverdue: numberOrZero(overdueInsightsRaw?.max_days_overdue),
        averageDaysOverdue,
        agingBuckets: {
          oneToThreeDays: numberOrZero(overdueInsightsRaw?.age_1_3),
          fourToSevenDays: numberOrZero(overdueInsightsRaw?.age_4_7),
          eightPlusDays: numberOrZero(overdueInsightsRaw?.age_8_plus),
        },
        history: {
          totalHistoricallyOverdue: historicallyOverdueCount,
          currentlyOverdue: overdueCount,
          recoveredOverdue: recoveredOverdueCount,
          recoveredThisMonth: recoveredOverdueThisMonth,
          lastRecoveredAt: overdueResolutionInsightsRaw?.last_resolved_at || null,
        },
      },
      campusBreakdown,
      classPerformance,
      staffControl: staffControl.sort((a, b) => b.activityScore - a.activityScore),
      topAreas: topAreasRaw.map(item => ({ name: item.area, count: numberOrZero(item.count) })),
      topSources: topSourcesRaw.map(item => ({ name: item['source.name'] || 'Unknown', count: numberOrZero(item.count) })),
    });
  } catch (error) {
    console.error('Control analytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
