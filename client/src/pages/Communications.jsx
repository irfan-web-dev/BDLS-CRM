import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Download, Phone, MessageSquare, Mail, Users, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { isSuperAdmin, isAdminOrAbove } from '../utils/roleUtils';
import { formatDate, formatDateTime } from '../utils/helpers';
import PageHeader from '../components/ui/PageHeader';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import CampusTypeTabs from '../components/ui/CampusTypeTabs';

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
const HISTORY_FIELD_LABELS = {
  inquiry_id: 'Inquiry',
  follow_up_date: 'Follow-up Date',
  type: 'Type',
  duration_minutes: 'Duration (min)',
  staff_id: 'Staff',
  notes: 'Notes',
  interest_level: 'Interest Level',
  next_action: 'Next Action',
  next_action_date: 'Next Action Date',
  was_on_time: 'Was On Time',
};

function normalizeCommStats(data) {
  const byType = Array.isArray(data?.byType)
    ? data.byType.map(item => ({
      type: item?.type ? String(item.type) : 'Other',
      count: Number(item?.count) || 0,
    }))
    : [];

  const dailyData = Array.isArray(data?.dailyData)
    ? data.dailyData.map(item => ({
      ...item,
      day: item?.day || '',
      count: Number(item?.count) || 0,
    }))
    : [];

  const staffComms = Array.isArray(data?.staffComms)
    ? data.staffComms.map(item => ({
      name: item?.name || 'Unassigned',
      count: Number(item?.count) || 0,
    }))
    : [];

  return {
    contacted: Number(data?.contacted) || 0,
    contactRate: Number(data?.contactRate) || 0,
    notContacted: Number(data?.notContacted) || 0,
    followUpsThisMonth: Number(data?.followUpsThisMonth) || 0,
    followUpsLastMonth: Number(data?.followUpsLastMonth) || 0,
    totalActive: Number(data?.totalActive) || 0,
    byType,
    dailyData,
    staffComms,
  };
}

function formatHistoryKey(key) {
  if (HISTORY_FIELD_LABELS[key]) return HISTORY_FIELD_LABELS[key];
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatHistoryValue(key, value, lookups = {}) {
  if (value === null || value === undefined || value === '') return '-';
  const normalizedKey = String(key || '');
  const { staffById = {}, inquiryById = {} } = lookups;

  const resolveLabel = (map, rawValue) => {
    if (rawValue === null || rawValue === undefined || rawValue === '') return null;
    const mapKey = String(rawValue);
    return map[mapKey] || map[rawValue] || null;
  };

  if (normalizedKey === 'staff_id') {
    const label = resolveLabel(staffById, value);
    return label || `Staff #${value}`;
  }
  if (normalizedKey === 'inquiry_id') {
    const label = resolveLabel(inquiryById, value);
    return label || `Inquiry #${value}`;
  }

  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    if (value.includes('T') && !Number.isNaN(Date.parse(value))) return formatDateTime(value);
    return value.replace(/_/g, ' ');
  }
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.length ? value.map(v => formatHistoryValue(key, v, lookups)).join(', ') : '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function actionLabel(action) {
  if (action === 'follow_up.create') return 'Created';
  if (action === 'follow_up.update') return 'Updated';
  if (action === 'follow_up.delete') return 'Deleted';
  return String(action || 'Unknown').replace(/_/g, ' ');
}

export default function Communications() {
  const { user } = useAuth();
  const [commStats, setCommStats] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState([]);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [campusType, setCampusType] = useState(user?.campus?.campus_type || 'school');

  useEffect(() => { loadStats(); }, [campusType]);
  useEffect(() => { loadFollowUps(); }, [page, typeFilter, selectedStaffIds, campusType]);
  useEffect(() => { loadStaffOptions(); }, [campusType, user?.id, user?.role]);
  useEffect(() => {
    setPage(1);
    setSelectedStaffIds([]);
    setStaffOptions([]);
  }, [campusType]);

  async function loadStats() {
    try {
      const params = isSuperAdmin(user) ? { campus_type: campusType } : {};
      const res = await api.get('/dashboard/communication-stats', { params });
      setCommStats(normalizeCommStats(res.data));
    } catch (err) { console.error(err); }
  }

  async function loadFollowUps() {
    setLoading(true);
    try {
      const params = { page, limit: 15, include_history: true };
      if (typeFilter) params.type = typeFilter;
      if (selectedStaffIds.length > 0) params.staff_ids = selectedStaffIds.join(',');
      if (isSuperAdmin(user)) params.campus_type = campusType;
      const res = await api.get('/follow-ups', { params });
      const payload = res.data?.followUps ?? res.data;
      const list = Array.isArray(payload) ? payload : [];
      setFollowUps(list);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function loadStaffOptions() {
    try {
      if (!isAdminOrAbove(user)) {
        if (user?.id) {
          setStaffOptions([{ id: user.id, name: user.name || 'My Records' }]);
        } else {
          setStaffOptions([]);
        }
        setSelectedStaffIds([]);
        return;
      }

      const params = isSuperAdmin(user) ? { campus_type: campusType } : {};
      const res = await api.get('/users/staff/available', { params });
      const options = (Array.isArray(res.data) ? res.data : [])
        .map(item => ({ id: item.id, name: item.name || `Staff ${item.id}` }))
        .filter(item => item.id)
        .sort((a, b) => a.name.localeCompare(b.name));

      setStaffOptions(options);
      setSelectedStaffIds((prev) => prev.filter(id => options.some(opt => opt.id === id)));
    } catch (err) {
      console.error(err);
    }
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
  const toggleStaffSelection = (staffId) => {
    setSelectedStaffIds((prev) => (
      prev.includes(staffId) ? prev.filter(id => id !== staffId) : [...prev, staffId]
    ));
    setPage(1);
  };
  const selectedStaffNames = staffOptions
    .filter(option => selectedStaffIds.includes(option.id))
    .map(option => option.name);
  const staffById = staffOptions.reduce((acc, option) => {
    acc[String(option.id)] = option.name || `Staff #${option.id}`;
    return acc;
  }, {});
  const byTypeData = Array.isArray(commStats?.byType) ? commStats.byType : [];
  const sortedByType = [...byTypeData].sort((a, b) => b.count - a.count);
  const dailyData = Array.isArray(commStats?.dailyData) ? commStats.dailyData : [];

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

      {isSuperAdmin(user) && (
        <CampusTypeTabs value={campusType} onChange={setCampusType} className="mb-4" />
      )}

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
              <BarChart data={dailyData}>
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
            {byTypeData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={byTypeData} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                      {byTypeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 mt-2">
                  {sortedByType.map((t, i) => (
                    <div key={`${t.type}-${i}`} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-gray-600">{t.type}</span>
                      </div>
                      <span className="font-medium">{t.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">No channel activity yet</p>
            )}
          </div>
        </div>
      )}

      {/* Follow-ups List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Communication Log</h3>
          <div className="flex flex-wrap items-center gap-2">
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

            <details className="relative">
              <summary className="list-none cursor-pointer rounded-lg border border-gray-300 bg-white py-1.5 px-3 text-sm text-gray-700 hover:bg-gray-50">
                Staff Filter{selectedStaffIds.length > 0 ? ` (${selectedStaffIds.length})` : ''}
              </summary>
              <div className="absolute left-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-gray-200 bg-white p-3 shadow-lg sm:left-auto sm:right-0 sm:w-72">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Select Staff</p>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {staffOptions.map((staff) => (
                    <label key={staff.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedStaffIds.includes(staff.id)}
                        onChange={() => toggleStaffSelection(staff.id)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="truncate">{staff.name}</span>
                    </label>
                  ))}
                  {staffOptions.length === 0 && (
                    <p className="text-xs text-gray-400">No staff available</p>
                  )}
                </div>
                {selectedStaffIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setSelectedStaffIds([]); setPage(1); }}
                    className="mt-3 text-xs font-medium text-primary-600 hover:text-primary-700"
                  >
                    Clear Staff Filter
                  </button>
                )}
              </div>
            </details>
          </div>
        </div>

        {selectedStaffIds.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-600">
              Filtering by staff: {selectedStaffNames.join(', ')}
            </p>
          </div>
        )}

        {loading ? <LoadingSpinner /> : (
          <div className="divide-y divide-gray-50">
            {followUps.map(f => {
              const Icon = TYPE_ICONS[f.type] || Phone;
              const color = TYPE_COLORS[f.type] || '#6b7280';
              const history = Array.isArray(f.change_history) ? f.change_history : [];
              const createdAt = f.created_at || f.createdAt;
              const updatedAt = f.updated_at || f.updatedAt;
              const historyLookups = {
                staffById: {
                  ...staffById,
                  ...(f?.staff?.id ? { [String(f.staff.id)]: f.staff.name || `Staff #${f.staff.id}` } : {}),
                },
                inquiryById: {
                  ...(f?.inquiry_id ? { [String(f.inquiry_id)]: f?.inquiry?.student_name || `Inquiry #${f.inquiry_id}` } : {}),
                  ...(f?.inquiry?.id ? { [String(f.inquiry.id)]: f.inquiry.student_name || `Inquiry #${f.inquiry.id}` } : {}),
                },
              };
              return (
                <Link
                  key={f.id}
                  to={`/inquiries/${f.inquiry_id}`}
                  className="block p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5 rounded-full p-2" style={{ backgroundColor: `${color}15` }}>
                      <Icon className="h-4 w-4" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">
                          {f.inquiry?.student_name || `Inquiry #${f.inquiry_id}`}
                        </p>
                        <span className="text-xs text-gray-400">{formatDateTime(f.follow_up_date)}</span>
                      </div>

                      <div className="mt-1 text-xs text-gray-600 space-y-1">
                        <p>
                          <span className="font-medium">Type:</span> {typeLabel(f.type)}
                          {f.duration_minutes ? ` (${f.duration_minutes} min)` : ''}
                          {f.staff?.name ? ` | Staff: ${f.staff.name}` : ''}
                        </p>
                        <p>
                          <span className="font-medium">Inquiry Status:</span> {typeLabel(f.inquiry?.status || '-')}
                          {f.inquiry?.parent_name ? ` | Parent: ${f.inquiry.parent_name}` : ''}
                          {f.inquiry?.parent_phone ? ` | Phone: ${f.inquiry.parent_phone}` : ''}
                        </p>
                        {f.notes && (
                          <p><span className="font-medium">Notes:</span> {f.notes}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-2">
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
                        {f.next_action && (
                          <span className="text-xs text-gray-500">Next Action: {f.next_action}</span>
                        )}
                        {f.next_action_date && (
                          <span className="text-xs text-gray-500">Next Date: {formatDate(f.next_action_date)}</span>
                        )}
                        {f.was_on_time !== null && f.was_on_time !== undefined && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${f.was_on_time ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {f.was_on_time ? 'On Time' : 'Late'}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">Created: {formatDateTime(createdAt)}</span>
                        <span className="text-xs text-gray-400">Updated: {formatDateTime(updatedAt)}</span>
                      </div>

                      <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                          Change History
                        </p>
                        {history.length === 0 ? (
                          <p className="text-xs text-gray-400">No history available for this record.</p>
                        ) : (
                          <div className="max-h-80 overflow-y-auto pr-1 space-y-3">
                            {history.map((event) => {
                              const previousState = event?.old_values && typeof event.old_values === 'object'
                                ? event.old_values
                                : {};
                              const changedFields = event?.new_values?.changed_fields && typeof event.new_values.changed_fields === 'object'
                                ? event.new_values.changed_fields
                                : {};
                              const nextSnapshot = event?.new_values && typeof event.new_values === 'object'
                                ? event.new_values
                                : {};
                              const changedEntries = Object.entries(changedFields);
                              const previousEntries = Object.entries(previousState);

                              return (
                                <div key={event.id} className="rounded border border-gray-200 bg-white p-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <p className="text-xs font-semibold text-gray-800">
                                      Update Made: {actionLabel(event.action)}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {event.user?.name ? `By ${event.user.name} | ` : ''}
                                      {formatDateTime(event.created_at)}
                                    </p>
                                  </div>

                                  <div className="space-y-2">
                                    <div>
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Previous State</p>
                                      {previousEntries.length === 0 ? (
                                        <p className="text-xs text-gray-400">No previous state captured.</p>
                                      ) : (
                                        <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-1">
                                          {previousEntries.map(([key, value]) => (
                                            <p key={`prev-${event.id}-${key}`} className="text-xs text-gray-700">
                                              <span className="font-medium">{formatHistoryKey(key)}:</span> {formatHistoryValue(key, value, historyLookups)}
                                            </p>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    <div>
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Changes Applied</p>
                                      {changedEntries.length > 0 ? (
                                        <div className="mt-1 grid grid-cols-1 gap-1">
                                          {changedEntries.map(([key, value]) => (
                                            <p key={`chg-${event.id}-${key}`} className="text-xs text-gray-700">
                                              <span className="font-medium">{formatHistoryKey(key)}:</span>{' '}
                                              {formatHistoryValue(key, value?.from, historyLookups)} {'->'} {formatHistoryValue(key, value?.to, historyLookups)}
                                            </p>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-1">
                                          {Object.entries(nextSnapshot)
                                            .filter(([key]) => key !== 'changed_fields')
                                            .map(([key, value]) => (
                                              <p key={`new-${event.id}-${key}`} className="text-xs text-gray-700">
                                                <span className="font-medium">{formatHistoryKey(key)}:</span> {formatHistoryValue(key, value, historyLookups)}
                                              </p>
                                            ))}
                                          {Object.entries(nextSnapshot).filter(([key]) => key !== 'changed_fields').length === 0 && (
                                            <p className="text-xs text-gray-400">No change details available.</p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
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
