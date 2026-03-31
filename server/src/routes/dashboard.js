import { Router } from 'express';
import { Op } from 'sequelize';
import {
  Inquiry, InquiryFollowUp, InquirySource, User, AuditLog, sequelize,
} from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { authorize, scopeToCampus } from '../middleware/authorize.js';

const router = Router();

router.use(authenticate);
router.use(scopeToCampus);

// GET /api/dashboard/admission-stats
router.get('/admission-stats', async (req, res) => {
  try {
    const where = { deleted_at: null, ...req.campusScope };
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

    // By source
    const bySource = await Inquiry.findAll({
      where,
      attributes: [
        'source_id',
        [sequelize.fn('COUNT', sequelize.col('Inquiry.id')), 'count'],
      ],
      include: [{ model: InquirySource, as: 'source', attributes: ['name'] }],
      group: ['source_id', 'source.id', 'source.name'],
      raw: true,
    });

    res.json({
      totalInquiries,
      thisMonth,
      todayCount,
      conversionRate: parseFloat(conversionRate),
      byStatus,
      bySource: bySource.map(s => ({
        name: s['source.name'] || 'Unknown',
        count: parseInt(s.count),
      })),
    });
  } catch (error) {
    console.error('Admission stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/dashboard/follow-up-stats
router.get('/follow-up-stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const baseWhere = { deleted_at: null, ...req.campusScope };
    if (req.user.role === 'staff') {
      baseWhere.assigned_staff_id = req.user.id;
    }

    const activeStatuses = { [Op.notIn]: ['admitted', 'not_interested', 'lost', 'no_response'] };

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

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const completedThisMonth = await InquiryFollowUp.count({
      where: {
        created_at: { [Op.gte]: startOfMonth },
        ...(req.user.role === 'staff' ? { staff_id: req.user.id } : {}),
      },
    });

    res.json({ dueToday, overdue, completedThisMonth });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/dashboard/staff-performance
router.get('/staff-performance', authorize('super_admin', 'admin'), async (req, res) => {
  try {
    const staffWhere = { deleted_at: null, is_active: true, ...req.campusScope };
    const staff = await User.findAll({
      where: staffWhere,
      attributes: ['id', 'name', 'role'],
    });

    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const performance = await Promise.all(staff.map(async (s) => {
      const totalInquiries = await Inquiry.count({
        where: { assigned_staff_id: s.id, deleted_at: null },
      });

      const admittedCount = await Inquiry.count({
        where: { assigned_staff_id: s.id, deleted_at: null, status: 'admitted' },
      });

      const followUpsThisMonth = await InquiryFollowUp.count({
        where: { staff_id: s.id, created_at: { [Op.gte]: startOfMonth } },
      });

      const followUpsToday = await InquiryFollowUp.count({
        where: {
          staff_id: s.id,
          created_at: {
            [Op.gte]: new Date(today),
            [Op.lt]: new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000),
          },
        },
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
    const where = { deleted_at: null, ...req.campusScope };
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

    // Total active inquiries (not closed)
    const activeStatuses = ['new', 'contacted_attempt_1', 'contacted_connected', 'follow_up_scheduled', 'visit_scheduled', 'visit_completed', 'form_issued', 'form_submitted', 'documents_pending'];
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
      where: { created_at: { [Op.gte]: startOfMonth } },
    });

    // Follow-ups last month
    const followUpsLastMonth = await InquiryFollowUp.count({
      where: { created_at: { [Op.gte]: startOfLastMonth, [Op.lte]: endOfLastMonth } },
    });

    // By communication type this month
    const byType = await InquiryFollowUp.findAll({
      where: { created_at: { [Op.gte]: startOfMonth } },
      attributes: ['type', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
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
        where: { follow_up_date: dayStr },
      });
      dailyData.push({
        date: dayStr,
        day: d.toLocaleDateString('en', { weekday: 'short', day: 'numeric' }),
        count,
      });
    }

    // Staff communication breakdown
    const staffComms = await InquiryFollowUp.findAll({
      where: { created_at: { [Op.gte]: startOfMonth } },
      attributes: ['staff_id', [sequelize.fn('COUNT', sequelize.col('InquiryFollowUp.id')), 'count']],
      include: [{ model: User, as: 'staff', attributes: ['name'] }],
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
    }

    const activities = await AuditLog.findAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']],
      limit: 20,
    });

    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
