import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  UserSearch, UserCheck, TrendingUp, Clock, AlertTriangle,
  Phone, ArrowRight, MessageSquare, PhoneOff, Users, Workflow, CheckCircle2, UserX,
} from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { isAdminOrAbove, isSuperAdmin } from '../utils/roleUtils';
import { formatDate, relativeTime } from '../utils/helpers';
import { INQUIRY_STATUSES } from '../utils/constants';
import StatCard from '../components/ui/StatCard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import PageHeader from '../components/ui/PageHeader';
import { InquiryStatusBadge } from '../components/ui/StatusBadge';
import CampusTypeTabs from '../components/ui/CampusTypeTabs';

const PIE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899', '#6b7280', '#14b8a6'];
const CAMPUS_SCOPE_LABELS = { all: 'All Campuses', school: 'School', college: 'College' };

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

  useEffect(() => {
    if (isSuperAdmin(user)) {
      setCampusType(prev => (prev === 'school' || prev === 'college' || prev === 'all' ? prev : 'all'));
      return;
    }
    setCampusType(user?.campus?.campus_type || 'school');
  }, [user?.id, user?.role, user?.campus?.campus_type]);

  useEffect(() => {
    loadDashboard();
  }, [campusType, user?.id, user?.role]);

  useEffect(() => {
    if (!selectedStaffId) return;
    const controlRows = controlAnalytics?.staffControl || [];
    const performanceRows = staffPerformance || [];
    if (![...controlRows, ...performanceRows].some(s => s.id === selectedStaffId)) {
      setSelectedStaffId(null);
    }
  }, [staffPerformance, controlAnalytics, selectedStaffId]);

  async function loadDashboard() {
    setLoading(true);
    try {
      const params = (isSuperAdmin(user) && campusType !== 'all') ? { campus_type: campusType } : {};

      const [admRes, fuRes, remRes, actRes, commRes, spRes, caRes] = await Promise.all([
        api.get('/dashboard/admission-stats', { params }),
        api.get('/dashboard/follow-up-stats', { params }),
        api.get('/inquiries/reminders', { params }),
        api.get('/dashboard/recent-activity'),
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

  const sourceData = admissionStats?.bySource || [];
  const scopeLabel = CAMPUS_SCOPE_LABELS[campusType] || 'School';
  const controlOverview = controlAnalytics?.overview;
  const controlRisk = controlAnalytics?.risk;
  const classPerformance = controlAnalytics?.classPerformance || [];
  const staffControl = controlAnalytics?.staffControl || [];
  const topAreas = controlAnalytics?.topAreas || [];
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
    noActivity: reminders?.noActivity || [],
  };

  const reminderRows = [
    ...reminderBucketsRaw.overdue.map(item => ({ ...item, reminderType: 'overdue' })),
    ...reminderBucketsRaw.dueToday.map(item => ({ ...item, reminderType: 'dueToday' })),
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

  const filteredStaffRows = mergedStaffRows.filter((item) => {
    if (staffRoleFilter !== 'all' && item.role !== staffRoleFilter) return false;
    if (staffHealthFilter === 'high_conversion' && Number(item.performanceConversionRate) < 40) return false;
    if (staffHealthFilter === 'low_conversion' && Number(item.performanceConversionRate) >= 20) return false;
    if (staffHealthFilter === 'no_followup_today' && Number(item.today) > 0) return false;
    if (staffSearch.trim() && !item.name?.toLowerCase().includes(staffSearch.trim().toLowerCase())) return false;
    return true;
  });
  const selectedStaff = mergedStaffRows.find(s => s.id === selectedStaffId);
  const followUpRemindersSection = (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-[34rem] flex flex-col mb-6">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
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
          title="This Month"
          value={admissionStats?.thisMonth || 0}
          icon={TrendingUp}
          color="purple"
          subtitle={`${admissionStats?.todayCount || 0} today`}
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
          icon={Clock}
          color={followUpStats?.overdue > 0 ? 'red' : 'yellow'}
          subtitle={followUpStats?.overdue > 0 ? `${followUpStats.overdue} overdue` : 'On track'}
        />
      </div>

      {!isAdminOrAbove(user) && followUpRemindersSection}

      {/* Control Analytics */}
      {isAdminOrAbove(user) && controlOverview && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-emerald-100 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Active Pipeline</p>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                  <Workflow className="h-4 w-4" />
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{controlOverview.activeInquiries || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Ready for follow-up</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-blue-100 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Admissions Closed</p>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{controlOverview.admittedCount || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Conversion: {controlOverview.conversionRate || 0}%</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Unassigned Inquiries</p>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-50 text-amber-600">
                  <UserX className="h-4 w-4" />
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{controlOverview.unassignedCount || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Need ownership now</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-emerald-100 p-5 sm:col-span-2 xl:col-span-1">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Control Snapshot</h3>
              <div className="space-y-4">
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
              </div>

              <div className="grid grid-cols-2 gap-3 mt-6">
                <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="text-xl font-semibold text-gray-900">{controlOverview?.totalInquiries || 0}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 border border-gray-100">
                  <p className="text-xs text-gray-500">Conversion</p>
                  <p className="text-xl font-semibold text-gray-900">{controlOverview?.conversionRate || 0}%</p>
                </div>
              </div>
            </div>
          </div>

          {followUpRemindersSection}

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
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Area / Source Insights</h3>
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
                  <Tooltip />
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
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {recentActivity.slice(0, 10).map(act => (
              <div key={act.id} className="flex items-start gap-3 text-sm">
                <div className="mt-1 h-2 w-2 rounded-full bg-primary-400 shrink-0" />
                <div className="flex-1">
                  <span className="text-gray-900">{act.action.replace(/\./g, ' ').replace(/_/g, ' ')}</span>
                  <p className="text-xs text-gray-400">{relativeTime(act.created_at)}</p>
                </div>
              </div>
            ))}
            {recentActivity.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No recent activity</p>
            )}
          </div>
        </div>
      )}

      {/* Recent Activity for Admin (full width) */}
      {isAdminOrAbove(user) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {recentActivity.slice(0, 10).map(act => (
              <div key={act.id} className="flex items-start gap-3 text-sm">
                <div className="mt-1 h-2 w-2 rounded-full bg-primary-400 shrink-0" />
                <div className="flex-1">
                  <span className="font-medium text-gray-900">{act.user?.name}</span>
                  <span className="text-gray-500"> {act.action.replace(/\./g, ' ').replace(/_/g, ' ')}</span>
                  {act.entity_type && <span className="text-gray-400"> ({act.entity_type} #{act.entity_id})</span>}
                  <p className="text-xs text-gray-400">{relativeTime(act.created_at)}</p>
                </div>
              </div>
            ))}
            {recentActivity.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No recent activity</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
