import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Download, Phone, MessageSquare, Mail, Users, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { isAdminOrAbove } from '../utils/roleUtils';
import { formatDate } from '../utils/helpers';
import PageHeader from '../components/ui/PageHeader';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { InquiryStatusBadge } from '../components/ui/StatusBadge';

const TYPE_ICONS = {
  outgoing_call: PhoneOutgoing,
  incoming_call: PhoneIncoming,
  whatsapp: MessageSquare,
  in_person: Users,
  sms: Mail,
  email: Mail,
  other: Phone,
};

const TYPE_COLORS = {
  outgoing_call: '#3b82f6',
  incoming_call: '#22c55e',
  whatsapp: '#25d366',
  in_person: '#8b5cf6',
  sms: '#f59e0b',
  email: '#ef4444',
  other: '#6b7280',
};

const PIE_COLORS = ['#3b82f6', '#22c55e', '#25d366', '#8b5cf6', '#f59e0b', '#ef4444', '#6b7280'];

export default function Communications() {
  const { user } = useAuth();
  const [commStats, setCommStats] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [pagination, setPagination] = useState({});
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { loadFollowUps(); }, [page, typeFilter]);

  async function loadStats() {
    try {
      const res = await api.get('/dashboard/communication-stats');
      setCommStats(res.data);
    } catch (err) { console.error(err); }
  }

  async function loadFollowUps() {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (typeFilter) params.type = typeFilter;
      const res = await api.get('/follow-ups', { params });
      setFollowUps(res.data.followUps || res.data);
      if (res.data.pagination) setPagination(res.data.pagination);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  function downloadCSV() {
    if (!followUps.length) return;
    const headers = ['Date', 'Inquiry', 'Parent', 'Type', 'Duration (min)', 'Notes', 'Interest', 'Next Action', 'Staff'];
    const rows = followUps.map(f => [
      f.follow_up_date,
      f.inquiry?.student_name || '',
      f.inquiry?.parent_name || '',
      f.type?.replace(/_/g, ' '),
      f.duration_minutes || '',
      (f.notes || '').replace(/,/g, ';'),
      f.interest_level?.replace(/_/g, ' ') || '',
      f.next_action || '',
      f.staff?.name || '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `communications-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const typeLabel = (t) => t?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div>
      <PageHeader
        title="Communications"
        subtitle="All follow-ups and contact history"
        action={
          <button onClick={downloadCSV} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      />

      {/* Stats Cards */}
      {commStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500">Contacted</p>
            <p className="text-2xl font-bold text-green-600">{commStats.contacted}</p>
            <p className="text-xs text-gray-400">{commStats.contactRate}% rate</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500">Not Contacted</p>
            <p className="text-2xl font-bold text-red-600">{commStats.notContacted}</p>
            <p className="text-xs text-gray-400">Need follow-up</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500">This Month</p>
            <p className="text-2xl font-bold text-blue-600">{commStats.followUpsThisMonth}</p>
            <p className="text-xs text-gray-400">Last: {commStats.followUpsLastMonth}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500">Active Pipeline</p>
            <p className="text-2xl font-bold text-purple-600">{commStats.totalActive}</p>
            <p className="text-xs text-gray-400">inquiries</p>
          </div>
        </div>
      )}

      {/* Charts */}
      {commStats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Daily Communications (14 Days)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={commStats.dailyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Follow-ups" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">By Channel</h3>
            {commStats.byType?.length > 0 && (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={commStats.byType} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                      {commStats.byType.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 mt-2">
                  {commStats.byType.sort((a, b) => b.count - a.count).map((t, i) => (
                    <div key={t.type} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-gray-600">{t.type}</span>
                      </div>
                      <span className="font-medium">{t.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Follow-ups List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Communication Log</h3>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 py-1.5 px-3 text-sm outline-none"
          >
            <option value="">All Types</option>
            <option value="outgoing_call">Outgoing Call</option>
            <option value="incoming_call">Incoming Call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="in_person">In Person</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </select>
        </div>

        {loading ? <LoadingSpinner /> : (
          <div className="divide-y divide-gray-50">
            {followUps.map(f => {
              const Icon = TYPE_ICONS[f.type] || Phone;
              const color = TYPE_COLORS[f.type] || '#6b7280';
              return (
                <Link to={`/inquiries/${f.inquiry_id}`} key={f.id} className="flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex-shrink-0 mt-0.5 rounded-full p-2" style={{ backgroundColor: `${color}15` }}>
                    <Icon className="h-4 w-4" style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {f.inquiry?.student_name || `Inquiry #${f.inquiry_id}`}
                      </p>
                      <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(f.follow_up_date)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {typeLabel(f.type)}
                      {f.duration_minutes ? ` - ${f.duration_minutes} min` : ''}
                      {f.staff?.name ? ` by ${f.staff.name}` : ''}
                    </p>
                    {f.notes && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{f.notes}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {f.interest_level && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          f.interest_level === 'very_interested' ? 'bg-green-100 text-green-700' :
                          f.interest_level === 'interested' ? 'bg-blue-100 text-blue-700' :
                          f.interest_level === 'not_sure' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {f.interest_level.replace(/_/g, ' ')}
                        </span>
                      )}
                      {f.next_action && <span className="text-xs text-gray-400">{f.next_action}</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
            {followUps.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No communications found</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
