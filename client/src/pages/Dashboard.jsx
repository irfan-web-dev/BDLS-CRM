import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  UserSearch, UserCheck, TrendingUp, Clock, AlertTriangle,
  Phone, ArrowRight,
} from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { isAdminOrAbove } from '../utils/roleUtils';
import { formatDate, relativeTime } from '../utils/helpers';
import { INQUIRY_STATUSES } from '../utils/constants';
import StatCard from '../components/ui/StatCard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import PageHeader from '../components/ui/PageHeader';
import { InquiryStatusBadge } from '../components/ui/StatusBadge';

const PIE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899', '#6b7280', '#14b8a6'];

export default function Dashboard() {
  const { user } = useAuth();
  const [admissionStats, setAdmissionStats] = useState(null);
  const [followUpStats, setFollowUpStats] = useState(null);
  const [reminders, setReminders] = useState(null);
  const [staffPerformance, setStaffPerformance] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const [admRes, fuRes, remRes, actRes] = await Promise.all([
        api.get('/dashboard/admission-stats'),
        api.get('/dashboard/follow-up-stats'),
        api.get('/inquiries/reminders'),
        api.get('/dashboard/recent-activity'),
      ]);
      setAdmissionStats(admRes.data);
      setFollowUpStats(fuRes.data);
      setReminders(remRes.data);
      setRecentActivity(actRes.data);

      if (isAdminOrAbove(user)) {
        const spRes = await api.get('/dashboard/staff-performance');
        setStaffPerformance(spRes.data);
      }
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

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`Welcome back, ${user?.name}`} />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Inquiries"
          value={admissionStats?.totalInquiries || 0}
          icon={UserSearch}
          color="blue"
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Follow-up Reminders */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Follow-up Reminders</h3>
            <Link to="/inquiries?filter=overdue" className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Overdue */}
          {reminders?.overdue?.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-medium text-red-600">Overdue ({reminders.overdue.length})</span>
              </div>
              <div className="space-y-2">
                {reminders.overdue.slice(0, 3).map(inq => (
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

          {/* Due Today */}
          {reminders?.dueToday?.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-1 mb-2">
                <Clock className="h-3.5 w-3.5 text-yellow-500" />
                <span className="text-xs font-medium text-yellow-600">Due Today ({reminders.dueToday.length})</span>
              </div>
              <div className="space-y-2">
                {reminders.dueToday.slice(0, 3).map(inq => (
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

          {/* No Activity */}
          {reminders?.noActivity?.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-2">
                <Phone className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-500">No Contact 3+ Days ({reminders.noActivity.length})</span>
              </div>
              <div className="space-y-2">
                {reminders.noActivity.slice(0, 3).map(inq => (
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

          {!reminders?.overdue?.length && !reminders?.dueToday?.length && !reminders?.noActivity?.length && (
            <p className="text-sm text-gray-400 text-center py-6">All caught up! No pending follow-ups.</p>
          )}
        </div>

        {/* Staff Performance (Admin only) */}
        {isAdminOrAbove(user) && staffPerformance && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Staff Performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="pb-2 font-medium">Staff</th>
                    <th className="pb-2 font-medium text-center">Inquiries</th>
                    <th className="pb-2 font-medium text-center">Converted</th>
                    <th className="pb-2 font-medium text-center">Today</th>
                  </tr>
                </thead>
                <tbody>
                  {staffPerformance.map(s => (
                    <tr key={s.id} className="border-b border-gray-50">
                      <td className="py-2.5 font-medium text-gray-900">{s.name}</td>
                      <td className="py-2.5 text-center">{s.totalInquiries}</td>
                      <td className="py-2.5 text-center">
                        <span className="text-green-600">{s.admittedCount}</span>
                        <span className="text-gray-400 text-xs ml-1">({s.conversionRate}%)</span>
                      </td>
                      <td className="py-2.5 text-center">{s.followUpsToday}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Recent Activity (if not admin, show in right column) */}
        {!isAdminOrAbove(user) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
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
      </div>

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
