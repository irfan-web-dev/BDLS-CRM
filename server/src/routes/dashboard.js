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
