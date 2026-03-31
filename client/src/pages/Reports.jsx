import { useState, useEffect } from 'react';
import { Download, FileText, MessageSquare, Users, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { INQUIRY_STATUSES } from '../utils/constants';
import PageHeader from '../components/ui/PageHeader';
import LoadingSpinner from '../components/ui/LoadingSpinner';

export default function Reports() {
  const { user } = useAuth();
  const [admissionStats, setAdmissionStats] = useState(null);
  const [commStats, setCommStats] = useState(null);
  const [staffPerformance, setStaffPerformance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('inquiry');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const [admRes, commRes, staffRes] = await Promise.all([
        api.get('/dashboard/admission-stats'),
        api.get('/dashboard/communication-stats'),
        api.get('/dashboard/staff-performance').catch(() => ({ data: null })),
      ]);
      setAdmissionStats(admRes.data);
      setCommStats(commRes.data);
      setStaffPerformance(staffRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  function downloadInquiryReport() {
    if (!admissionStats) return;
    const rows = [['Report', 'Inquiry Summary Report'], ['Generated', new Date().toLocaleString()], [''], ['Metric', 'Value'],
      ['Total Inquiries', admissionStats.totalInquiries],
      ['This Month', admissionStats.thisMonth],
      ['Today', admissionStats.todayCount],
      ['Conversion Rate', `${admissionStats.conversionRate}%`],
      [''], ['Status', 'Count'],
      ...admissionStats.byStatus.map(s => {
        const label = INQUIRY_STATUSES.find(st => st.value === s.status)?.label || s.status;
        return [label, s.count];
      }),
      [''], ['Source', 'Count'],
      ...admissionStats.bySource.map(s => [s.name, s.count]),
    ];
    downloadCSV(rows, 'inquiry-report');
  }

  function downloadCommReport() {
    if (!commStats) return;
    const rows = [['Report', 'Communication Report'], ['Generated', new Date().toLocaleString()], [''], ['Metric', 'Value'],
      ['Total Active Inquiries', commStats.totalActive],
      ['Contacted', commStats.contacted],
      ['Not Contacted', commStats.notContacted],
      ['Contact Rate', `${commStats.contactRate}%`],
      ['Follow-ups This Month', commStats.followUpsThisMonth],
      ['Follow-ups Last Month', commStats.followUpsLastMonth],
      [''], ['Channel', 'Count'],
      ...commStats.byType.map(t => [t.type, t.count]),
      [''], ['Staff', 'Communications'],
      ...commStats.staffComms.map(s => [s.name, s.count]),
    ];
    downloadCSV(rows, 'communication-report');
  }

  function downloadStaffReport() {
    if (!staffPerformance) return;
    const rows = [['Report', 'Staff Performance Report'], ['Generated', new Date().toLocaleString()], [''],
      ['Staff', 'Total Inquiries', 'Admitted', 'Conversion %', 'Follow-ups This Month', 'Follow-ups Today'],
      ...staffPerformance.map(s => [s.name, s.totalInquiries, s.admittedCount, `${s.conversionRate}%`, s.followUpsThisMonth, s.followUpsToday]),
    ];
    downloadCSV(rows, 'staff-performance-report');
  }

  function downloadCSV(rows, name) {
    const csv = rows.map(r => Array.isArray(r) ? r.join(',') : r).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <LoadingSpinner />;

  const tabs = [
    { id: 'inquiry', label: 'Inquiry Report', icon: FileText },
    { id: 'communication', label: 'Communication Report', icon: MessageSquare },
    { id: 'staff', label: 'Staff Performance', icon: Users },
  ];

  const statusData = admissionStats?.byStatus?.map(s => {
    const found = INQUIRY_STATUSES.find(st => st.value === s.status);
    return { name: found?.label || s.status, count: parseInt(s.count) };
  }).sort((a, b) => b.count - a.count) || [];

  return (
    <div>
      <PageHeader title="Reports" subtitle="Download and view CRM reports" />

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Inquiry Report */}
      {activeTab === 'inquiry' && admissionStats && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Inquiry Summary</h3>
            <button onClick={downloadInquiryReport} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Download className="h-4 w-4" /> Download CSV
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <p className="text-xs text-gray-500">Total Inquiries</p>
              <p className="text-2xl font-bold text-gray-900">{admissionStats.totalInquiries}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <p className="text-xs text-gray-500">This Month</p>
              <p className="text-2xl font-bold text-blue-600">{admissionStats.thisMonth}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <p className="text-xs text-gray-500">Today</p>
              <p className="text-2xl font-bold text-purple-600">{admissionStats.todayCount}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <p className="text-xs text-gray-500">Conversion Rate</p>
              <p className="text-2xl font-bold text-green-600">{admissionStats.conversionRate}%</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">By Status</h4>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={statusData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">By Source</h4>
              <div className="space-y-3">
                {admissionStats.bySource.sort((a, b) => b.count - a.count).map(s => {
                  const max = Math.max(...admissionStats.bySource.map(x => x.count));
                  return (
                    <div key={s.name} className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 w-24 truncate">{s.name}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-5">
                        <div className="h-5 rounded-full bg-primary-500" style={{ width: `${(s.count / max) * 100}%` }} />
                      </div>
                      <span className="text-sm font-medium text-gray-700 w-8 text-right">{s.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Communication Report */}
      {activeTab === 'communication' && commStats && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Communication Summary</h3>
            <button onClick={downloadCommReport} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Download className="h-4 w-4" /> Download CSV
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <p className="text-xs text-gray-500">Contacted</p>
              <p className="text-2xl font-bold text-green-600">{commStats.contacted}</p>
              <p className="text-xs text-gray-400">{commStats.contactRate}% rate</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <p className="text-xs text-gray-500">Not Contacted</p>
              <p className="text-2xl font-bold text-red-600">{commStats.notContacted}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <p className="text-xs text-gray-500">This Month</p>
              <p className="text-2xl font-bold text-blue-600">{commStats.followUpsThisMonth}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <p className="text-xs text-gray-500">Last Month</p>
              <p className="text-2xl font-bold text-gray-600">{commStats.followUpsLastMonth}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Daily Trend (14 Days)</h4>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={commStats.dailyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Follow-ups" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Channel Breakdown</h4>
              <div className="space-y-3">
                {commStats.byType.sort((a, b) => b.count - a.count).map(t => {
                  const max = Math.max(...commStats.byType.map(x => x.count));
                  return (
                    <div key={t.type} className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 w-28 truncate">{t.type}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-5">
                        <div className="h-5 rounded-full bg-green-500" style={{ width: `${(t.count / max) * 100}%` }} />
                      </div>
                      <span className="text-sm font-medium text-gray-700 w-8 text-right">{t.count}</span>
                    </div>
                  );
                })}
              </div>
              {commStats.staffComms?.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-gray-900 mt-6 mb-3">By Staff</h4>
                  <div className="space-y-2">
                    {commStats.staffComms.sort((a, b) => b.count - a.count).map(s => (
                      <div key={s.name} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{s.name}</span>
                        <span className="text-sm font-bold text-gray-900">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Staff Performance Report */}
      {activeTab === 'staff' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Staff Performance</h3>
            {staffPerformance && (
              <button onClick={downloadStaffReport} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <Download className="h-4 w-4" /> Download CSV
              </button>
            )}
          </div>

          {staffPerformance ? (
            <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase border-b">
                    <th className="px-4 py-3">Staff</th>
                    <th className="px-4 py-3 text-center">Total Inquiries</th>
                    <th className="px-4 py-3 text-center">Admitted</th>
                    <th className="px-4 py-3 text-center">Conversion</th>
                    <th className="px-4 py-3 text-center">Follow-ups (Month)</th>
                    <th className="px-4 py-3 text-center">Today</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {staffPerformance.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                      <td className="px-4 py-3 text-center">{s.totalInquiries}</td>
                      <td className="px-4 py-3 text-center text-green-600 font-medium">{s.admittedCount}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          parseFloat(s.conversionRate) >= 20 ? 'bg-green-100 text-green-700' :
                          parseFloat(s.conversionRate) >= 10 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {s.conversionRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">{s.followUpsThisMonth}</td>
                      <td className="px-4 py-3 text-center">{s.followUpsToday}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-400">
              Staff performance is only available for admin users.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
