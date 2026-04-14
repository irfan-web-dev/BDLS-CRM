import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  UserSearch, UserCheck, TrendingUp, Clock, AlertTriangle,
  Phone, ArrowRight, MessageSquare, PhoneOff, Users,
} from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { isAdminOrAbove, isSuperAdmin } from '../utils/roleUtils';
import { formatDate, formatDateTime, relativeTime } from '../utils/helpers';
import { INQUIRY_STATUSES } from '../utils/constants';
import StatCard from '../components/ui/StatCard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import PageHeader from '../components/ui/PageHeader';
import { InquiryStatusBadge } from '../components/ui/StatusBadge';
import CampusTypeTabs from '../components/ui/CampusTypeTabs';

const PIE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899', '#6b7280', '#14b8a6'];
const CAMPUS_SCOPE_LABELS = { all: 'All Campuses', school: 'School', college: 'College' };
const ACTIVITY_FIELD_LABELS = {
  next_follow_up_date: 'next follow-up date',
  assigned_staff_id: 'assigned staff',
  status: 'status',
  interest_level: 'interest level',
  notes: 'notes',
  parent_phone: 'parent phone',
  parent_name: 'parent name',
  student_name: 'student name',
  inquiry_date: 'inquiry date',
};
const ACTIVITY_TIME_FILTERS = [
  { value: '24h', label: 'Last 24 Hours', days: 1 },
  { value: '3d', label: 'Last 3 Days', days: 3 },
  { value: '7d', label: 'Last 7 Days', days: 7 },
  { value: '14d', label: 'Last 14 Days', days: 14 },
  { value: '30d', label: 'Last 30 Days', days: 30 },
  { value: 'all', label: 'All Time', days: null },
];

function formatActivityAction(action) {
  return String(action || '').replace(/\./g, ' ').replace(/_/g, ' ');
}

function formatActivityField(field) {
  if (!field) return '';
  if (ACTIVITY_FIELD_LABELS[field]) return ACTIVITY_FIELD_LABELS[field];
  return String(field).replace(/_/g, ' ');
}

function getActivityInquiryId(activity) {
  if (activity?.entity_type === 'inquiry' && activity?.entity_id) return activity.entity_id;
  if (activity?.entity_type === 'follow_up') {
    return activity?.new_values?.inquiry_id || activity?.old_values?.inquiry_id || null;
  }
  return null;
}

function getActivityChangedFields(activity) {
  if (!String(activity?.action || '').includes('update')) return [];
  const oldValues = activity?.old_values && typeof activity.old_values === 'object' ? activity.old_values : {};
  const newValues = activity?.new_values && typeof activity.new_values === 'object' ? activity.new_values : {};
  return Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)]))
    .filter((key) => JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key]))
    .slice(0, 3);
}

export default function Dashboard() {
  const { user } = useAuth();
  const [admissionStats, setAdmissionStats] = useState(null);
  const [followUpStats, setFollowUpStats] = useState(null);
  const [reminders, setReminders] = useState(null);
  const [staffPerformance, setStaffPerformance] = useState(null);
  const [controlAnalytics, setControlAnalytics] = useState(null);
  const [commStats, setCommStats] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [campusType, setCampusType] = useState(() => (isSuperAdmin(user) ? 'all' : (user?.campus?.campus_type === 'college' ? 'college' : 'school')));
  const [reminderTypeFilter, setReminderTypeFilter] = useState('all');
  const [reminderStatusFilter, setReminderStatusFilter] = useState('all');
  const [reminderSearch, setReminderSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState('all');
  const [staffHealthFilter, setStaffHealthFilter] = useState('all');
  const [staffSearch, setStaffSearch] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState(null);
  const [activityTimeFilter, setActivityTimeFilter] = useState('all');
  const [activityStaffFilter, setActivityStaffFilter] = useState('all');

  useEffect(() => {
    if (isSuperAdmin(user)) {
      setCampusType(prev => (prev === 'school' || prev === 'college' || prev === 'all' ? prev : 'all'));
      return;
    }
    setCampusType(user?.campus?.campus_type || 'school');
  }, [user?.id, user?.role, user?.campus?.campus_type]);

  useEffect(() => {
    loadDashboard();
  }, [campusType, user?.id, user?.role, activityStaffFilter]);

  useEffect(() => {
    if (!selectedStaffId) return;
    const controlRows = controlAnalytics?.staffControl || [];
    const performanceRows = staffPerformance || [];
    if (![...controlRows, ...performanceRows].some(s => s.id === selectedStaffId)) {
      setSelectedStaffId(null);
    }
  }, [staffPerformance, controlAnalytics, selectedStaffId]);

  useEffect(() => {
    if (!isAdminOrAbove(user)) return;
    if (activityStaffFilter === 'all') return;

    const selectedId = Number.parseInt(activityStaffFilter, 10);
    if (!Number.isInteger(selectedId)) {
      setActivityStaffFilter('all');
      return;
    }

    const controlRows = controlAnalytics?.staffControl || [];
    const performanceRows = staffPerformance || [];
    const exists = [...controlRows, ...performanceRows].some((row) => Number(row?.id) === selectedId);
    if (!exists) {
      setActivityStaffFilter('all');
    }
  }, [activityStaffFilter, controlAnalytics, staffPerformance, user?.role]);

  async function loadDashboard() {
    setLoading(true);
    try {
      const params = (isSuperAdmin(user) && campusType !== 'all') ? { campus_type: campusType } : {};
      const activityParams = {
        ...params,
        limit: isAdminOrAbove(user) ? 200 : 100,
      };
      if (isAdminOrAbove(user) && activityStaffFilter !== 'all') {
        const staffId = Number.parseInt(activityStaffFilter, 10);
        if (Number.isInteger(staffId)) {
          activityParams.staff_id = staffId;
        }
      }

      const [admRes, fuRes, remRes, actRes, commRes, spRes, caRes] = await Promise.all([
        api.get('/dashboard/admission-stats', { params }),
        api.get('/dashboard/follow-up-stats', { params }),
        api.get('/inquiries/reminders', { params }),
        api.get('/dashboard/recent-activity', { params: activityParams }),
        api.get('/dashboard/communication-stats', { params }),
        isAdminOrAbove(user)
          ? api.get('/dashboard/staff-performance', { params }).catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
        isAdminOrAbove(user)
          ? api.get('/dashboard/control-analytics', { params }).catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
      ]);
      setAdmissionStats(admRes.data);
      setFollowUpStats(fuRes.data);
      setReminders(remRes.data);
      setRecentActivity(actRes.data);
      setCommStats(commRes.data);
      setStaffPerformance(spRes.data);
      setControlAnalytics(caRes.data);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  const statusData = admissionStats?.byStatus?.map(s => {
    const found = INQUIRY_STATUSES.find(st => st.value === s.status);
    return { name: found?.label || s.status, value: parseInt(s.count) };
  }) || [];

  const sourceData = (admissionStats?.bySourceDetailed || admissionStats?.bySource || []).map((s) => ({
    name: s.name || 'Unknown',
    count: Number(s.count) || 0,
    schoolCount: Number(s?.breakdown?.school ?? s?.schoolCount ?? 0) || 0,
    collegeCount: Number(s?.breakdown?.college ?? s?.collegeCount ?? 0) || 0,
    unknownCount: Number(s?.breakdown?.unknown ?? s?.unknownCount ?? 0) || 0,
  }));
  const scopeLabel = CAMPUS_SCOPE_LABELS[campusType] || 'School';
  const isAllCampuses = campusType === 'all';
  const sourceTooltipContent = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const item = payload[0]?.payload;
    if (!item) return null;
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm text-xs">
        <p className="font-semibold text-gray-900 mb-1">{item.name}</p>
        <p className="text-gray-700">Total: {item.count}</p>
        {isAllCampuses ? (
          <>
            <p className="text-gray-600">School: {item.schoolCount || 0}</p>
            <p className="text-gray-600">College: {item.collegeCount || 0}</p>
          </>
        ) : (
          <p className="text-gray-600">{scopeLabel}: {item.count}</p>
        )}
      </div>
    );
  };
  const controlOverview = controlAnalytics?.overview;
  const controlRisk = controlAnalytics?.risk;
  const controlOverdue = controlAnalytics?.overdue;
  const controlCampusBreakdown = controlAnalytics?.campusBreakdown;
  const classPerformance = controlAnalytics?.classPerformance || [];
  const staffControl = controlAnalytics?.staffControl || [];
  const topAreas = controlAnalytics?.topAreas || [];
  const lowRiskDefinition = controlRisk?.lowDefinition
    || 'Low Risk means active inquiries without overdue pressure and with healthy recent contact progress.';
  const schoolControl = controlCampusBreakdown?.school || {
    totalInquiries: 0, activeInquiries: 0, lowRiskCount: 0, dueTodayCount: 0, overdueCount: 0, historicalOverdueCount: 0, recoveredOverdueCount: 0,
  };
  const collegeControl = controlCampusBreakdown?.college || {
    totalInquiries: 0, activeInquiries: 0, lowRiskCount: 0, dueTodayCount: 0, overdueCount: 0, historicalOverdueCount: 0, recoveredOverdueCount: 0,
  };
  const campusControlCards = isAllCampuses
    ? [
      { label: 'School', data: schoolControl },
      { label: 'College', data: collegeControl },
    ]
    : [
      {
        label: campusType === 'college' ? 'College' : 'School',
        data: campusType === 'college' ? collegeControl : schoolControl,
      },
    ];
  const overdueAging = controlOverdue?.agingBuckets || {};
  const overdueHistory = controlOverdue?.history || {};
  const oldestOverdueLabel = controlOverdue?.oldestDate
    ? `${formatDate(controlOverdue.oldestDate)} (${controlOverdue.oldestDaysOverdue || 0}d)`
    : 'No overdue follow-up';
  const averageOverdueDaysLabel = controlOverview?.overdueCount
    ? `${controlOverdue?.averageDaysOverdue || 0}d`
    : '-';
  const historicalOverdueCount = overdueHistory.totalHistoricallyOverdue ?? controlOverview?.historicallyOverdueCount ?? 0;
  const recoveredOverdueCount = overdueHistory.recoveredOverdue ?? controlOverview?.recoveredOverdueCount ?? 0;
  const recoveredOverdueThisMonth = overdueHistory.recoveredThisMonth ?? controlOverview?.recoveredOverdueThisMonth ?? 0;
  const lastRecoveredAtLabel = overdueHistory.lastRecoveredAt
    ? formatDateTime(overdueHistory.lastRecoveredAt)
    : '-';
  const thisMonthConversionRate = admissionStats?.conversionRate ?? 0;
  const overallConversionRate = controlOverview?.conversionRate ?? 0;
  const performanceTitle = campusType === 'school'
    ? 'Class Performance'
    : campusType === 'college'
      ? 'Discipline Performance'
      : 'Class / Discipline Performance';
  const performanceColumnTitle = campusType === 'school'
    ? 'Class'
    : campusType === 'college'
      ? 'Discipline'
      : 'Class / Discipline';

  const reminderBucketsRaw = {
    overdue: reminders?.overdue || [],
    dueToday: reminders?.dueToday || [],
    recoveredOverdue: reminders?.previouslyOverdue || [],
    noActivity: reminders?.noActivity || [],
  };

  const reminderRows = [
    ...reminderBucketsRaw.overdue.map(item => ({ ...item, reminderType: 'overdue' })),
    ...reminderBucketsRaw.dueToday.map(item => ({ ...item, reminderType: 'dueToday' })),
    ...reminderBucketsRaw.recoveredOverdue.map(item => ({ ...item, reminderType: 'recoveredOverdue' })),
    ...reminderBucketsRaw.noActivity.map(item => ({ ...item, reminderType: 'noActivity' })),
  ];

  const reminderStatusOptions = [...new Set(reminderRows.map(item => item.status).filter(Boolean))];
  const filteredReminderRows = reminderRows.filter((item) => {
    if (reminderTypeFilter !== 'all' && item.reminderType !== reminderTypeFilter) return false;
    if (reminderStatusFilter !== 'all' && item.status !== reminderStatusFilter) return false;
    if (reminderSearch.trim()) {
      const q = reminderSearch.trim().toLowerCase();
      const haystack = `${item.student_name || ''} ${item.parent_name || ''} ${item.parent_phone || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const filteredReminderBuckets = {
    overdue: filteredReminderRows.filter(item => item.reminderType === 'overdue'),
    dueToday: filteredReminderRows.filter(item => item.reminderType === 'dueToday'),
    recoveredOverdue: filteredReminderRows.filter(item => item.reminderType === 'recoveredOverdue'),
    noActivity: filteredReminderRows.filter(item => item.reminderType === 'noActivity'),
  };

  const staffRows = staffPerformance || [];
  const mergedStaffMap = new Map();

  staffControl.forEach((row) => {
    mergedStaffMap.set(row.id, {
      ...row,
      inquiries: row.totalAssigned || 0,
      converted: row.admittedCount || 0,
      today: 0,
      performanceConversionRate: row.conversionRate || 0,
      performanceFollowUpsThisMonth: row.followUpsThisMonth || 0,
    });
  });

  staffRows.forEach((row) => {
    const existing = mergedStaffMap.get(row.id);
    mergedStaffMap.set(row.id, {
      id: row.id,
      name: row.name,
      role: row.role,
      totalAssigned: existing?.totalAssigned || row.totalInquiries || 0,
      activeAssigned: existing?.activeAssigned || 0,
      admittedCount: existing?.admittedCount || row.admittedCount || 0,
      followUpsThisMonth: existing?.followUpsThisMonth || row.followUpsThisMonth || 0,
      overdueCount: existing?.overdueCount || 0,
      activityScore: existing?.activityScore || 0,
      inquiries: row.totalInquiries || existing?.totalAssigned || 0,
      converted: row.admittedCount || existing?.admittedCount || 0,
      today: row.followUpsToday || 0,
      performanceConversionRate: row.conversionRate || existing?.conversionRate || 0,
      performanceFollowUpsThisMonth: row.followUpsThisMonth || existing?.followUpsThisMonth || 0,
    });
  });

  const mergedStaffRows = Array.from(mergedStaffMap.values());
  const activityStaffOptions = mergedStaffRows
    .filter((row) => Number.isInteger(Number(row?.id)))
    .map((row) => ({ id: Number(row.id), name: row.name || `Staff #${row.id}` }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredStaffRows = mergedStaffRows.filter((item) => {
    if (staffRoleFilter !== 'all' && item.role !== staffRoleFilter) return false;
    if (staffHealthFilter === 'high_conversion' && Number(item.performanceConversionRate) < 40) return false;
    if (staffHealthFilter === 'low_conversion' && Number(item.performanceConversionRate) >= 20) return false;
    if (staffHealthFilter === 'no_followup_today' && Number(item.today) > 0) return false;
    if (staffSearch.trim() && !item.name?.toLowerCase().includes(staffSearch.trim().toLowerCase())) return false;
    return true;
  });
  const selectedStaff = mergedStaffRows.find(s => s.id === selectedStaffId);
  const selectedActivityWindow = ACTIVITY_TIME_FILTERS.find(opt => opt.value === activityTimeFilter);
  const activityThresholdMs = selectedActivityWindow?.days
    ? (Date.now() - (selectedActivityWindow.days * 24 * 60 * 60 * 1000))
    : null;
  const filteredRecentActivity = recentActivity.filter((act) => {
    if (!activityThresholdMs) return true;
    if (!act?.created_at) return false;
    const time = new Date(act.created_at).getTime();
    return Number.isFinite(time) && time >= activityThresholdMs;
  });
  const followUpRemindersSection = (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-[34rem] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Follow-up Reminders</h3>
        <Link to="/inquiries?filter=overdue" className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <select
          value={reminderTypeFilter}
          onChange={e => setReminderTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-300 py-1.5 px-3 text-xs outline-none"
        >
          <option value="all">All Reminder Types</option>
          <option value="overdue">Overdue</option>
          <option value="dueToday">Due Today</option>
          <option value="recoveredOverdue">Recovered Overdue</option>
          <option value="noActivity">No Contact 3+ Days</option>
        </select>
        <select
          value={reminderStatusFilter}
          onChange={e => setReminderStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 py-1.5 px-3 text-xs outline-none"
        >
          <option value="all">All Statuses</option>
          {reminderStatusOptions.map(status => {
            const found = INQUIRY_STATUSES.find(s => s.value === status);
            return <option key={status} value={status}>{found?.label || status}</option>;
          })}
        </select>
        <input
          value={reminderSearch}
          onChange={e => setReminderSearch(e.target.value)}
          placeholder="Search student/parent"
          className="rounded-lg border border-gray-300 py-1.5 px-3 text-xs outline-none"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {filteredReminderBuckets.overdue.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1 mb-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs font-medium text-red-600">Overdue ({filteredReminderBuckets.overdue.length})</span>
            </div>
            <div className="space-y-2">
              {filteredReminderBuckets.overdue.map(inq => (
                <Link key={inq.id} to={`/inquiries/${inq.id}`} className="block rounded-lg border border-red-200 bg-red-50 p-3 hover:bg-red-100 transition-colors">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-900">{inq.student_name}</span>
                    <span className="text-xs text-red-600">Due: {formatDate(inq.next_follow_up_date)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{inq.parent_name} - {inq.parent_phone}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {filteredReminderBuckets.dueToday.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1 mb-2">
              <Clock className="h-3.5 w-3.5 text-yellow-500" />
              <span className="text-xs font-medium text-yellow-600">Due Today ({filteredReminderBuckets.dueToday.length})</span>
            </div>
            <div className="space-y-2">
              {filteredReminderBuckets.dueToday.map(inq => (
                <Link key={inq.id} to={`/inquiries/${inq.id}`} className="block rounded-lg border border-yellow-200 bg-yellow-50 p-3 hover:bg-yellow-100 transition-colors">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-900">{inq.student_name}</span>
                    <InquiryStatusBadge status={inq.status} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{inq.parent_name} - {inq.parent_phone}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {filteredReminderBuckets.recoveredOverdue.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1 mb-2">
              <Clock className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-700">
                Recovered Overdue ({filteredReminderBuckets.recoveredOverdue.length})
              </span>
            </div>
            <div className="space-y-2">
              {filteredReminderBuckets.recoveredOverdue.map(inq => (
                <Link key={inq.id} to={`/inquiries/${inq.id}`} className="block rounded-lg border border-emerald-200 bg-emerald-50 p-3 hover:bg-emerald-100 transition-colors">
                  <div className="flex justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900">{inq.student_name}</span>
                    <span className="text-[11px] text-emerald-700 text-right">
                      Resolved: {inq.overdue_last_resolved_at ? formatDateTime(inq.overdue_last_resolved_at) : '-'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{inq.parent_name} - {inq.parent_phone}</p>
                  <p className="text-[11px] text-emerald-800 mt-1">
                    Previously overdue: {inq.last_overdue_date ? formatDate(inq.last_overdue_date) : '-'} | Resolved count: {inq.overdue_resolved_count || 0}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {filteredReminderBuckets.noActivity.length > 0 && (
          <div>
            <div className="flex items-center gap-1 mb-2">
              <Phone className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-500">No Contact 3+ Days ({filteredReminderBuckets.noActivity.length})</span>
            </div>
            <div className="space-y-2">
              {filteredReminderBuckets.noActivity.map(inq => (
                <Link key={inq.id} to={`/inquiries/${inq.id}`} className="block rounded-lg border border-gray-200 p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-900">{inq.student_name}</span>
                    <InquiryStatusBadge status={inq.status} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{inq.parent_name}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {filteredReminderRows.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No reminders match current filters.</p>
        )}
      </div>
    </div>
  );
  const controlSnapshotSection = controlOverview && (
    <div className="bg-white rounded-xl shadow-sm border border-emerald-100 p-5 h-[34rem] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Control Snapshot</h3>
        <p className="text-[11px] text-gray-400">As of {formatDate(controlOverview?.asOfDate)}</p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-600">Low Risk Pool</span>
              <span className="font-semibold text-emerald-700">{controlRisk?.lowCount || 0}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-emerald-500"
                style={{
                  width: `${Math.min(
                    100,
                    controlOverview?.activeInquiries
                      ? ((controlRisk?.lowCount || 0) / controlOverview.activeInquiries) * 100
                      : 0,
                  )}%`,
                }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-600">Due Today</span>
              <span className="font-semibold text-yellow-700">{controlOverview?.dueTodayCount || 0}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-yellow-500"
                style={{
                  width: `${Math.min(
                    100,
                    controlOverview?.activeInquiries
                      ? ((controlOverview?.dueTodayCount || 0) / controlOverview.activeInquiries) * 100
                      : 0,
                  )}%`,
                }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-600">Overdue</span>
              <span className="font-semibold text-red-600">{controlOverview?.overdueCount || 0}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-red-500"
                style={{
                  width: `${Math.min(
                    100,
                    controlOverview?.activeInquiries
                      ? ((controlOverview?.overdueCount || 0) / controlOverview.activeInquiries) * 100
                      : 0,
                  )}%`,
                }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-600">Recovered Overdue</span>
              <span className="font-semibold text-emerald-700">{recoveredOverdueCount}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-emerald-400"
                style={{
                  width: `${Math.min(
                    100,
                    controlOverview?.activeInquiries
                      ? (recoveredOverdueCount / controlOverview.activeInquiries) * 100
                      : 0,
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-700 mb-1">Why Low Risk?</p>
          <p className="text-xs leading-5 text-emerald-900">{lowRiskDefinition}</p>
        </div>

        <div className="rounded-lg border border-red-100 bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-700 mb-2">Overdue Depth</p>
          <div className="space-y-1 text-xs text-gray-700">
            <div className="flex items-center justify-between">
              <span>Oldest overdue since</span>
              <span className="font-semibold text-gray-900">{oldestOverdueLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Average delay</span>
              <span className="font-semibold text-gray-900">{averageOverdueDaysLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Recovered this month</span>
              <span className="font-semibold text-emerald-700">{recoveredOverdueThisMonth}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Last recovered</span>
              <span className="font-semibold text-gray-900">{lastRecoveredAtLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Historically overdue (total)</span>
              <span className="font-semibold text-gray-900">{historicalOverdueCount}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="rounded-md border border-red-100 bg-white p-2 text-center">
              <p className="text-[11px] text-gray-500">1-3d</p>
              <p className="text-sm font-semibold text-gray-900">{overdueAging.oneToThreeDays || 0}</p>
            </div>
            <div className="rounded-md border border-red-100 bg-white p-2 text-center">
              <p className="text-[11px] text-gray-500">4-7d</p>
              <p className="text-sm font-semibold text-gray-900">{overdueAging.fourToSevenDays || 0}</p>
            </div>
            <div className="rounded-md border border-red-100 bg-white p-2 text-center">
              <p className="text-[11px] text-gray-500">8+d</p>
              <p className="text-sm font-semibold text-gray-900">{overdueAging.eightPlusDays || 0}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-700 mb-2">
            {isAllCampuses ? 'School vs College' : `${campusControlCards[0]?.label} Snapshot`}
          </p>
          <div className="space-y-2">
            {campusControlCards.map(item => (
              <div key={item.label} className="rounded-md border border-blue-100 bg-white p-2">
                <p className="text-xs font-semibold text-gray-800">{item.label}</p>
                <div className="grid grid-cols-4 gap-1 mt-1 text-[11px] text-gray-600">
                  <span>Total: {item.data.totalInquiries || 0}</span>
                  <span>Active: {item.data.activeInquiries || 0}</span>
                  <span>Due: {item.data.dueTodayCount || 0}</span>
                  <span>Overdue: {item.data.overdueCount || 0}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 mt-1 text-[11px]">
                  <span className="text-emerald-700">Low Risk: {item.data.lowRiskCount || 0}</span>
                  <span className="text-blue-700">Recovered: {item.data.recoveredOverdueCount || 0}</span>
                  <span className="text-gray-700">Historical: {item.data.historicalOverdueCount || 0}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-xl font-semibold text-gray-900">{controlOverview?.totalInquiries || 0}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
            <p className="text-xs text-gray-500">Conversion (This Month)</p>
            <p className="text-xl font-semibold text-gray-900">{thisMonthConversionRate}%</p>
            <p className="text-[11px] text-gray-500 mt-1">Overall: {overallConversionRate}%</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`Welcome back, ${user?.name}${isSuperAdmin(user) ? ` · ${scopeLabel} Scope` : ''}`} />

      {isSuperAdmin(user) && (
        <CampusTypeTabs
          value={campusType}
          onChange={setCampusType}
          includeAll
          className="mb-4"
        />
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <StatCard
          title="Today"
          value={admissionStats?.todayCount || 0}
          icon={Clock}
          color="purple"
          subtitle="New inquiries"
        />
        <StatCard
          title="This Month"
          value={admissionStats?.thisMonth || 0}
          icon={TrendingUp}
          color="blue"
          subtitle="Admissions this month"
        />
        <StatCard
          title="Total Inquiries"
          value={admissionStats?.totalInquiries || 0}
          icon={UserSearch}
          color="blue"
        />
        <StatCard
          title="Total Students"
          value={admissionStats?.totalStudents || 0}
          icon={Users}
          color="gray"
          subtitle="Active enrolled"
        />
        <StatCard
          title="Conversion Rate"
          value={`${admissionStats?.conversionRate || 0}%`}
          icon={UserCheck}
          color="green"
          subtitle="This month"
        />
        <StatCard
          title="Follow-ups Due"
          value={followUpStats?.dueToday || 0}
          icon={AlertTriangle}
          color={followUpStats?.overdue > 0 ? 'red' : 'yellow'}
          subtitle={
            followUpStats?.overdue > 0
              ? `${followUpStats.overdue} overdue · ${followUpStats?.recoveredOverdue || 0} recovered`
              : `${followUpStats?.recoveredOverdue || 0} recovered`
          }
        />
      </div>

      {!isAdminOrAbove(user) && (
        <div className="mb-6">
          {followUpRemindersSection}
        </div>
      )}

      {/* Control Analytics */}
      {isAdminOrAbove(user) && controlOverview && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-6">
            <div className="xl:col-span-8">{followUpRemindersSection}</div>
            <div className="xl:col-span-4">{controlSnapshotSection}</div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">{performanceTitle}</h3>
              <div className="h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="pb-2 font-medium">{performanceColumnTitle}</th>
                      <th className="pb-2 font-medium text-center">Total</th>
                      <th className="pb-2 font-medium text-center">Active</th>
                      <th className="pb-2 font-medium text-center">Admitted</th>
                      <th className="pb-2 font-medium text-center">Overdue</th>
                      <th className="pb-2 font-medium text-center">Conv.%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classPerformance.map(item => (
                      <tr key={item.className} className="border-b border-gray-50">
                        <td className="py-2.5 font-medium text-gray-900">{item.className}</td>
                        <td className="py-2.5 text-center">{item.total}</td>
                        <td className="py-2.5 text-center text-blue-600">{item.active}</td>
                        <td className="py-2.5 text-center text-green-600">{item.admitted}</td>
                        <td className="py-2.5 text-center text-red-600">{item.overdue}</td>
                        <td className="py-2.5 text-center">{item.conversionRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {classPerformance.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">No class data found</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Area Insights</h3>
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Top Areas</p>
                  <div className="space-y-2">
                    {topAreas.map((item, index) => {
                      const max = Math.max(...topAreas.map(x => x.count), 1);
                      return (
                        <div key={`${item.name}-${index}`}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-700 truncate pr-2">{item.name}</span>
                            <span className="font-semibold text-gray-900">{item.count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-100">
                            <div className="h-2 rounded-full bg-cyan-500" style={{ width: `${(item.count / max) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {topAreas.length === 0 && <p className="text-sm text-gray-400">No area data</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Staff Control Panel</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 lg:min-w-[34rem]">
                <select
                  value={staffRoleFilter}
                  onChange={e => setStaffRoleFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 py-1.5 px-3 text-xs outline-none"
                >
                  <option value="all">All Roles</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                </select>
                <select
                  value={staffHealthFilter}
                  onChange={e => setStaffHealthFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 py-1.5 px-3 text-xs outline-none"
                >
                  <option value="all">All Performance</option>
                  <option value="high_conversion">High Conversion (40%+)</option>
                  <option value="low_conversion">Low Conversion (&lt;20%)</option>
                  <option value="no_followup_today">No Follow-up Today</option>
                </select>
                <input
                  value={staffSearch}
                  onChange={e => setStaffSearch(e.target.value)}
                  placeholder="Search staff"
                  className="rounded-lg border border-gray-300 py-1.5 px-3 text-xs outline-none"
                />
              </div>
            </div>
            <div className="h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="pb-2 font-medium">Staff</th>
                    <th className="pb-2 font-medium text-center">Assigned</th>
                    <th className="pb-2 font-medium text-center">Active</th>
                    <th className="pb-2 font-medium text-center">Admitted</th>
                    <th className="pb-2 font-medium text-center">Follow-ups</th>
                    <th className="pb-2 font-medium text-center">Overdue</th>
                    <th className="pb-2 font-medium text-center">Score</th>
                    <th className="pb-2 font-medium text-center">Inquiries</th>
                    <th className="pb-2 font-medium text-center">Converted</th>
                    <th className="pb-2 font-medium text-center">Today</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaffRows.map(s => (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedStaffId(s.id)}
                      className={`border-b border-gray-50 cursor-pointer ${
                        selectedStaffId === s.id ? 'bg-primary-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="py-2.5 font-medium text-gray-900">{s.name}</td>
                      <td className="py-2.5 text-center">{s.totalAssigned}</td>
                      <td className="py-2.5 text-center text-blue-600">{s.activeAssigned}</td>
                      <td className="py-2.5 text-center text-green-600">{s.admittedCount}</td>
                      <td className="py-2.5 text-center">{s.followUpsThisMonth}</td>
                      <td className="py-2.5 text-center text-red-600">{s.overdueCount}</td>
                      <td className="py-2.5 text-center font-semibold">{s.activityScore}</td>
                      <td className="py-2.5 text-center">{s.inquiries}</td>
                      <td className="py-2.5 text-center text-green-600">{s.converted}</td>
                      <td className="py-2.5 text-center">{s.today}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredStaffRows.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No staff match current filters.</p>
              )}
            </div>
            {selectedStaff && (
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                <p className="text-sm font-semibold text-gray-900">{selectedStaff.name}</p>
                <p className="text-xs text-gray-600 mt-1">
                  Role: {selectedStaff.role?.replace('_', ' ')} · Conversion: {selectedStaff.performanceConversionRate}% · Follow-ups Today: {selectedStaff.today}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-700">
                  <span>Assigned: {selectedStaff.totalAssigned}</span>
                  <span>Active: {selectedStaff.activeAssigned}</span>
                  <span>Admitted: {selectedStaff.admittedCount}</span>
                  <span>This Month Follow-ups: {selectedStaff.performanceFollowUpsThisMonth}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Pipeline Status */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Inquiry Pipeline</h3>
          <div className="space-y-2">
            {INQUIRY_STATUSES.slice(0, 10).map(status => {
              const found = statusData.find(s => s.name === status.label);
              const count = found?.value || 0;
              const total = admissionStats?.totalInquiries || 1;
              const pct = ((count / total) * 100).toFixed(0);
              const colorMap = { blue: 'bg-blue-500', yellow: 'bg-yellow-500', green: 'bg-green-500', red: 'bg-red-500', gray: 'bg-gray-400' };
              return (
                <div key={status.value} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-36 truncate">{status.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
                    <div
                      className={`h-5 rounded-full ${colorMap[status.color]} transition-all`}
                      style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-700 w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Source Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Inquiries by Source</h3>
          {sourceData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={sourceData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                    {sourceData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={sourceTooltipContent} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {sourceData.slice(0, 5).map((s, i) => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-gray-600">{s.name}</span>
                    </div>
                    <span className="font-medium text-gray-900">{s.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">No data yet</p>
          )}
        </div>
      </div>

      {/* Communication Reports */}
      {commStats && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Contacted"
              value={commStats.contacted}
              icon={Phone}
              color="green"
              subtitle={`${commStats.contactRate}% contact rate`}
            />
            <StatCard
              title="Not Contacted"
              value={commStats.notContacted}
              icon={PhoneOff}
              color="red"
              subtitle="Need attention"
            />
            <StatCard
              title="Communications"
              value={commStats.followUpsThisMonth}
              icon={MessageSquare}
              color="blue"
              subtitle={`Last month: ${commStats.followUpsLastMonth}`}
            />
            <StatCard
              title="Active Inquiries"
              value={commStats.totalActive}
              icon={UserSearch}
              color="purple"
              subtitle="In pipeline"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Daily Communication Trend */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Communication Trend (14 Days)</h3>
              {commStats.dailyData?.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={commStats.dailyData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Follow-ups" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">No data</p>
              )}
            </div>

            {/* By Type + Staff Breakdown */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">By Channel</h3>
              {commStats.byType?.length > 0 ? (
                <div className="space-y-2 mb-6">
                  {commStats.byType.sort((a, b) => b.count - a.count).map(t => {
                    const max = Math.max(...commStats.byType.map(x => x.count));
                    return (
                      <div key={t.type} className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-28 truncate">{t.type}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-4">
                          <div
                            className="h-4 rounded-full bg-primary-500"
                            style={{ width: `${(t.count / max) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-6 text-right">{t.count}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">No data</p>
              )}

              {commStats.staffComms?.length > 0 && (
                <>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 mt-2">By Staff</h4>
                  <div className="space-y-1.5">
                    {commStats.staffComms.sort((a, b) => b.count - a.count).map(s => (
                      <div key={s.name} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{s.name}</span>
                        <span className="font-medium text-gray-900">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {!isAdminOrAbove(user) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
            <select
              value={activityTimeFilter}
              onChange={e => setActivityTimeFilter(e.target.value)}
              className="rounded-lg border border-gray-300 py-1.5 px-2.5 text-xs outline-none"
            >
              {ACTIVITY_TIME_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">
            Showing {filteredRecentActivity.length} of {recentActivity.length} activities
          </p>
          <div className="h-[26rem] overflow-y-auto pr-1">
            <div className="space-y-3">
              {filteredRecentActivity.map((act) => {
                const inquiryTargetId = getActivityInquiryId(act);
                const changedFields = getActivityChangedFields(act).map(formatActivityField);
                const rowContent = (
                  <div className="flex items-start gap-3 text-sm">
                    <div className="mt-1 h-2 w-2 rounded-full bg-primary-400 shrink-0" />
                    <div className="flex-1">
                      <span className="text-gray-900">{formatActivityAction(act.action)}</span>
                      {act.entity_type && <span className="text-gray-400"> ({act.entity_type} #{act.entity_id})</span>}
                      {changedFields.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">Changed: {changedFields.join(', ')}</p>
                      )}
                      {inquiryTargetId && (
                        <p className="text-xs text-primary-600 mt-1">Open inquiry #{inquiryTargetId}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDateTime(act.created_at)} · {relativeTime(act.created_at)}
                      </p>
                    </div>
                  </div>
                );
                return inquiryTargetId ? (
                  <Link key={act.id} to={`/inquiries/${inquiryTargetId}`} className="block rounded-lg p-2 -m-2 hover:bg-gray-50 transition-colors">
                    {rowContent}
                  </Link>
                ) : (
                  <div key={act.id} className="rounded-lg p-2 -m-2">
                    {rowContent}
                  </div>
                );
              })}
              {filteredRecentActivity.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No recent activity in selected time range</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity for Admin (full width) */}
      {isAdminOrAbove(user) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
            <div className="flex items-center gap-2">
              <select
                value={activityStaffFilter}
                onChange={e => setActivityStaffFilter(e.target.value)}
                className="rounded-lg border border-gray-300 py-1.5 px-2.5 text-xs outline-none"
              >
                <option value="all">All Staff Activity</option>
                {activityStaffOptions.map((staffOption) => (
                  <option key={staffOption.id} value={String(staffOption.id)}>{staffOption.name}</option>
                ))}
              </select>
              <select
                value={activityTimeFilter}
                onChange={e => setActivityTimeFilter(e.target.value)}
                className="rounded-lg border border-gray-300 py-1.5 px-2.5 text-xs outline-none"
              >
                {ACTIVITY_TIME_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">
            Showing {filteredRecentActivity.length} of {recentActivity.length} activities
          </p>
          <div className="h-[26rem] overflow-y-auto pr-1">
            <div className="space-y-3">
              {filteredRecentActivity.map((act) => {
                const inquiryTargetId = getActivityInquiryId(act);
                const changedFields = getActivityChangedFields(act).map(formatActivityField);
                const rowContent = (
                  <div className="flex items-start gap-3 text-sm">
                    <div className="mt-1 h-2 w-2 rounded-full bg-primary-400 shrink-0" />
                    <div className="flex-1">
                      <span className="font-medium text-gray-900">{act.user?.name || 'System'}</span>
                      <span className="text-gray-500"> {formatActivityAction(act.action)}</span>
                      {act.entity_type && <span className="text-gray-400"> ({act.entity_type} #{act.entity_id})</span>}
                      {changedFields.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">Changed: {changedFields.join(', ')}</p>
                      )}
                      {inquiryTargetId && (
                        <p className="text-xs text-primary-600 mt-1">Open inquiry #{inquiryTargetId}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDateTime(act.created_at)} · {relativeTime(act.created_at)}
                      </p>
                    </div>
                  </div>
                );
                return inquiryTargetId ? (
                  <Link key={act.id} to={`/inquiries/${inquiryTargetId}`} className="block rounded-lg p-2 -m-2 hover:bg-gray-50 transition-colors">
                    {rowContent}
                  </Link>
                ) : (
                  <div key={act.id} className="rounded-lg p-2 -m-2">
                    {rowContent}
                  </div>
                );
              })}
              {filteredRecentActivity.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No recent activity in selected time range</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
