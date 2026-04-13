import { useState, useEffect } from 'react';
import { Download, FileText, MessageSquare, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { isSuperAdmin } from '../utils/roleUtils';
import { INQUIRY_STATUSES } from '../utils/constants';
import PageHeader from '../components/ui/PageHeader';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import CampusTypeTabs from '../components/ui/CampusTypeTabs';

function safeList(value) {
  return Array.isArray(value) ? value : [];
}

function csvCell(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function formatCampusLabel(value) {
  if (value === 'college') return 'College';
  if (value === 'school') return 'School';
  return 'School';
}

export default function Reports() {
  const { user } = useAuth();
  const [admissionStats, setAdmissionStats] = useState(null);
  const [commStats, setCommStats] = useState(null);
  const [staffPerformance, setStaffPerformance] = useState(null);
  const [completeReport, setCompleteReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('inquiry');
  const [campusType, setCampusType] = useState(user?.campus?.campus_type || 'school');

  useEffect(() => { loadAll(); }, [campusType]);

  async function loadAll() {
    setLoading(true);
    try {
      const params = isSuperAdmin(user) ? { campus_type: campusType } : {};
      const [admRes, commRes, staffRes] = await Promise.all([
        api.get('/dashboard/admission-stats', { params }),
        api.get('/dashboard/communication-stats', { params }),
        api.get('/dashboard/staff-performance', { params }).catch(() => ({ data: null })),
      ]);
      const completeRes = await api.get('/dashboard/complete-report', { params }).catch(() => ({ data: null }));
      setAdmissionStats(admRes.data);
      setCommStats(commRes.data);
      setStaffPerformance(staffRes.data);
      setCompleteReport(completeRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const scopeLabel = isSuperAdmin(user) ? campusType : (user?.campus?.campus_type || 'school');
  const scopeTitle = formatCampusLabel(scopeLabel);
  const isCollegeScope = scopeLabel === 'college';

  useEffect(() => {
    if (!isCollegeScope && activeTab === 'college_complete') {
      setActiveTab('overall');
    }
  }, [isCollegeScope, activeTab]);

  function downloadInquiryReport() {
    if (!admissionStats) return;

    const rows = [
      ['Report', `${scopeLabel} Inquiry Summary Report`],
      ['Generated', new Date().toLocaleString()],
      ['Campus Scope', scopeLabel],
      [],
      ['Metric', 'Value'],
      ['Total Inquiries', admissionStats.totalInquiries],
      ['This Month', admissionStats.thisMonth],
      ['Today', admissionStats.todayCount],
      ['Conversion Rate (This Month)', `${admissionStats.conversionRate}%`],
      [],
      ['Status', 'Count'],
      ...safeList(admissionStats.byStatus).map((s) => {
        const label = INQUIRY_STATUSES.find(st => st.value === s.status)?.label || s.status;
        return [label, s.count];
      }),
      [],
      ['Source', 'Count'],
      ...safeList(admissionStats.bySource).map(s => [s.name, s.count]),
    ];
    downloadCSV(rows, `inquiry-report-${scopeLabel}`);
  }

  function downloadCommReport() {
    if (!commStats) return;

    const rows = [
      ['Report', `${scopeLabel} Communication Report`],
      ['Generated', new Date().toLocaleString()],
      ['Campus Scope', scopeLabel],
      [],
      ['Metric', 'Value'],
      ['Total Active Inquiries', commStats.totalActive],
      ['Contacted', commStats.contacted],
      ['Not Contacted', commStats.notContacted],
      ['Contact Rate', `${commStats.contactRate}%`],
      ['Follow-ups This Month', commStats.followUpsThisMonth],
      ['Follow-ups Last Month', commStats.followUpsLastMonth],
      [],
      ['Channel', 'Count'],
      ...safeList(commStats.byType).map(t => [t.type, t.count]),
      [],
      ['Staff', 'Communications'],
      ...safeList(commStats.staffComms).map(s => [s.name, s.count]),
    ];
    downloadCSV(rows, `communication-report-${scopeLabel}`);
  }

  function downloadStaffReport() {
    if (!staffPerformance) return;

    const rows = [
      ['Report', `${scopeLabel} Staff Performance Report`],
      ['Generated', new Date().toLocaleString()],
      ['Campus Scope', scopeLabel],
      [],
      ['Staff', 'Total Inquiries', 'Admitted', 'Conversion %', 'Follow-ups This Month', 'Follow-ups Today'],
      ...safeList(staffPerformance).map(s => [
        s.name,
        s.totalInquiries,
        s.admittedCount,
        `${s.conversionRate}%`,
        s.followUpsThisMonth,
        s.followUpsToday,
      ]),
    ];
    downloadCSV(rows, `staff-performance-report-${scopeLabel}`);
  }

  function downloadCollegeCompleteReport() {
    if (!completeReport) return;

    const dateOnly = new Date().toISOString().split('T')[0];
    const rows = [
      [`DAILY PFY INQUIRY VS ADMISSION SUMMARY SHEET ${completeReport.sessionLabel || ''}`],
      ['Generated', completeReport?.generatedAt ? new Date(completeReport.generatedAt).toLocaleString() : new Date().toLocaleString()],
      ['Date', dateOnly],
      ['Campus Scope', scopeTitle],
      [],
      [
        'SR #',
        'DISCIPLINE',
        'INQUIRY DETAIL',
        '',
        '',
        '',
        'ADMISSION FORM ACQUISITION',
        '',
        '',
        '',
        '',
        'ADMISSION STATUS',
        '',
        '',
        '',
        'INQUIRY FILE ENTRIES',
        '',
        'FOLLOW-UP CALLS',
        '',
        '',
        'ADMISSION FILE (FORMS) STATUS',
        '',
      ],
      [
        '',
        '',
        'BOYS',
        'GIRLS',
        'TODAY',
        'TO DATE',
        'BOYS',
        'GIRLS',
        'TODAY PAID',
        'TO DATE PAID',
        'TO DATE UNPAID',
        'BOYS',
        'GIRLS',
        'TODAY',
        'TO DATE',
        'ERP',
        'SOFT-W',
        'INFO-INQ',
        'SCH-DATA',
        'TO DATE',
        'BOYS',
        'GIRLS',
      ],
      ...safeList(completeReport.rows).map((row, index) => ([
        index + 1,
        row.discipline,
        row.inquiryBoys || 0,
        row.inquiryGirls || 0,
        row.inquiryToday || 0,
        row.inquiryToDate || 0,
        row.formBoys || 0,
        row.formGirls || 0,
        row.formTodayPaid || 0,
        row.formToDatePaid || 0,
        row.formToDateUnpaid || 0,
        row.admissionBoys || 0,
        row.admissionGirls || 0,
        row.admissionToday || 0,
        row.admissionToDate || 0,
        row.inquiryFileERP || 0,
        row.inquiryFileSoftW || 0,
        row.followUpTodayInfoInq || 0,
        row.followUpTodaySchData || 0,
        row.followUpToDate || 0,
        row.admissionFileBoys || 0,
        row.admissionFileGirls || 0,
      ])),
      [
        '',
        completeReport?.totals?.discipline || 'GRAND TOTAL',
        completeReport?.totals?.inquiryBoys || 0,
        completeReport?.totals?.inquiryGirls || 0,
        completeReport?.totals?.inquiryToday || 0,
        completeReport?.totals?.inquiryToDate || 0,
        completeReport?.totals?.formBoys || 0,
        completeReport?.totals?.formGirls || 0,
        completeReport?.totals?.formTodayPaid || 0,
        completeReport?.totals?.formToDatePaid || 0,
        completeReport?.totals?.formToDateUnpaid || 0,
        completeReport?.totals?.admissionBoys || 0,
        completeReport?.totals?.admissionGirls || 0,
        completeReport?.totals?.admissionToday || 0,
        completeReport?.totals?.admissionToDate || 0,
        completeReport?.totals?.inquiryFileERP || 0,
        completeReport?.totals?.inquiryFileSoftW || 0,
        completeReport?.totals?.followUpTodayInfoInq || 0,
        completeReport?.totals?.followUpTodaySchData || 0,
        completeReport?.totals?.followUpToDate || 0,
        completeReport?.totals?.admissionFileBoys || 0,
        completeReport?.totals?.admissionFileGirls || 0,
      ],
      [],
      ['INFORMATION OFFICER SIGNATURE', '', '', '', '', '', '', '', 'ADMISSION COORDINATOR SIGNATURE', '', '', '', '', '', '', '', '', '', 'PRINCIPAL SIGNATURE'],
    ];

    downloadCSV(rows, `college-complete-report-${scopeLabel}`);
  }

  function downloadOverallReport() {
    if (!admissionStats && !commStats && !staffPerformance) return;

    const rows = [
      ['Report', `${scopeTitle} Overall CRM Report`],
      ['Generated', new Date().toLocaleString()],
      ['Campus Scope', scopeTitle],
      [],
      ['Section', 'Inquiry Summary'],
    ];

    if (admissionStats) {
      rows.push(
        ['Metric', 'Value'],
        ['Total Inquiries', admissionStats.totalInquiries],
        ['This Month', admissionStats.thisMonth],
        ['Today', admissionStats.todayCount],
        ['Conversion Rate (This Month)', `${admissionStats.conversionRate}%`],
        [],
        ['Status', 'Count'],
        ...safeList(admissionStats.byStatus).map((s) => {
          const label = INQUIRY_STATUSES.find(st => st.value === s.status)?.label || s.status;
          return [label, s.count];
        }),
        [],
        ['Source', 'Count'],
        ...safeList(admissionStats.bySource).map(s => [s.name, s.count]),
      );
    } else {
      rows.push(['Status', 'Data unavailable']);
    }

    rows.push([], ['Section', 'Communication Summary']);
    if (commStats) {
      rows.push(
        ['Metric', 'Value'],
        ['Total Active Inquiries', commStats.totalActive],
        ['Contacted', commStats.contacted],
        ['Not Contacted', commStats.notContacted],
        ['Contact Rate', `${commStats.contactRate}%`],
        ['Follow-ups This Month', commStats.followUpsThisMonth],
        ['Follow-ups Last Month', commStats.followUpsLastMonth],
        [],
        ['Channel', 'Count'],
        ...safeList(commStats.byType).map(t => [t.type, t.count]),
        [],
        ['Staff', 'Communications'],
        ...safeList(commStats.staffComms).map(s => [s.name, s.count]),
      );
    } else {
      rows.push(['Status', 'Data unavailable']);
    }

    rows.push([], ['Section', 'Staff Performance']);
    if (staffPerformance) {
      rows.push(
        ['Staff', 'Total Inquiries', 'Admitted', 'Conversion %', 'Follow-ups This Month', 'Follow-ups Today'],
        ...safeList(staffPerformance).map(s => [
          s.name,
          s.totalInquiries,
          s.admittedCount,
          `${s.conversionRate}%`,
          s.followUpsThisMonth,
          s.followUpsToday,
        ]),
      );
    } else {
      rows.push(['Status', 'Data unavailable']);
    }

    downloadCSV(rows, `overall-report-${scopeLabel}`);
  }

  function downloadCSV(rows, name) {
    const csv = rows
      .map(row => (Array.isArray(row) ? row : [row]))
      .map(row => row.map(csvCell).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <LoadingSpinner />;

  const tabs = [
    { id: 'overall', label: 'Overall Report', icon: Download },
    ...(isCollegeScope ? [{ id: 'college_complete', label: 'College Complete Report', icon: FileText }] : []),
    { id: 'inquiry', label: 'Inquiry Report', icon: FileText },
    { id: 'communication', label: 'Communication Report', icon: MessageSquare },
    { id: 'staff', label: 'Staff Performance', icon: Users },
  ];

  const statusData = safeList(admissionStats?.byStatus).map((s) => {
    const found = INQUIRY_STATUSES.find(st => st.value === s.status);
    return { name: found?.label || s.status, count: parseInt(s.count, 10) || 0 };
  }).sort((a, b) => b.count - a.count);
  const overallSourceData = [...safeList(admissionStats?.bySource)]
    .map((s) => ({ name: s.name, count: parseInt(s.count, 10) || 0 }))
    .sort((a, b) => b.count - a.count);
  const overallChannelData = [...safeList(commStats?.byType)]
    .map((t) => ({ type: t.type, count: parseInt(t.count, 10) || 0 }))
    .sort((a, b) => b.count - a.count);
  const overallStaffData = [...safeList(staffPerformance)]
    .map((s) => ({
      ...s,
      totalInquiries: parseInt(s.totalInquiries, 10) || 0,
      admittedCount: parseInt(s.admittedCount, 10) || 0,
      followUpsThisMonth: parseInt(s.followUpsThisMonth, 10) || 0,
      followUpsToday: parseInt(s.followUpsToday, 10) || 0,
      conversionRate: parseFloat(s.conversionRate) || 0,
    }))
    .sort((a, b) => b.totalInquiries - a.totalInquiries);

  return (
    <div>
      <PageHeader title="Reports" subtitle="Download and view CRM reports" />

      {isSuperAdmin(user) && (
        <CampusTypeTabs value={campusType} onChange={setCampusType} className="mb-4" />
      )}

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

      {activeTab === 'overall' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{scopeTitle} Overall Report</h3>
              <p className="text-sm text-gray-500">
                Combined report of Inquiry, Communication, and Staff Performance for the selected campus scope.
              </p>
            </div>
            <button
              onClick={downloadOverallReport}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" /> Download Combined CSV
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <p className="text-xs text-gray-500">Total Inquiries</p>
              <p className="text-2xl font-bold text-gray-900">{admissionStats?.totalInquiries ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <p className="text-xs text-gray-500">This Month</p>
              <p className="text-2xl font-bold text-blue-600">{admissionStats?.thisMonth ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <p className="text-xs text-gray-500">Conversion Rate (This Month)</p>
              <p className="text-2xl font-bold text-green-600">{admissionStats?.conversionRate ?? 0}%</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <p className="text-xs text-gray-500">Contacted</p>
              <p className="text-2xl font-bold text-blue-600">{commStats?.contacted ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <p className="text-xs text-gray-500">Follow-ups (Month)</p>
              <p className="text-2xl font-bold text-emerald-600">{commStats?.followUpsThisMonth ?? 0}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <p className="text-xs text-gray-500">Staff Records</p>
              <p className="text-2xl font-bold text-purple-600">{safeList(staffPerformance).length}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Inquiry Breakdown</h4>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">By Status</p>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {statusData.length === 0 && <p className="text-sm text-gray-400">No status data available.</p>}
                    {statusData.map((row) => (
                      <div key={row.name} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{row.name}</span>
                        <span className="text-sm font-semibold text-gray-900">{row.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">Top Sources</p>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {overallSourceData.length === 0 && <p className="text-sm text-gray-400">No source data available.</p>}
                    {overallSourceData.map((source) => (
                      <div key={source.name} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{source.name}</span>
                        <span className="text-sm font-semibold text-gray-900">{source.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Communication Breakdown</h4>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">By Channel</p>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {overallChannelData.length === 0 && <p className="text-sm text-gray-400">No channel data available.</p>}
                    {overallChannelData.map((channel) => {
                      const max = Math.max(...overallChannelData.map(x => x.count), 1);
                      return (
                        <div key={channel.type} className="flex items-center gap-2">
                          <span className="text-sm text-gray-700 w-24 truncate">{channel.type}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(channel.count / max) * 100}%` }} />
                          </div>
                          <span className="text-sm font-semibold text-gray-900 w-8 text-right">{channel.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">Top Staff (Communications)</p>
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {safeList(commStats?.staffComms).length === 0 && <p className="text-sm text-gray-400">No staff communication data available.</p>}
                    {[...safeList(commStats?.staffComms)].sort((a, b) => b.count - a.count).map((member) => (
                      <div key={member.name} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{member.name}</span>
                        <span className="text-sm font-semibold text-gray-900">{member.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Staff Performance Snapshot</h4>
              <div className="overflow-auto max-h-[370px]">
                {overallStaffData.length === 0 ? (
                  <p className="text-sm text-gray-400">No staff performance data available.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase border-b">
                        <th className="py-2 text-left">Staff</th>
                        <th className="py-2 text-center">Inquiries</th>
                        <th className="py-2 text-center">Admitted</th>
                        <th className="py-2 text-center">Conv.</th>
                        <th className="py-2 text-center">Today</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {overallStaffData.slice(0, 10).map((row) => (
                        <tr key={row.id}>
                          <td className="py-2 text-gray-900 font-medium">{row.name}</td>
                          <td className="py-2 text-center">{row.totalInquiries}</td>
                          <td className="py-2 text-center text-green-600">{row.admittedCount}</td>
                          <td className="py-2 text-center">{row.conversionRate}%</td>
                          <td className="py-2 text-center">{row.followUpsToday}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Inquiry Status Distribution</h4>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={statusData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-gray-400">No inquiry status data available.</div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Communication Trend (14 Days)</h4>
              {safeList(commStats?.dailyData).length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={safeList(commStats?.dailyData)}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-gray-400">No communication trend data available.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'college_complete' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">College Complete Report</h3>
              <p className="text-sm text-gray-500">
                Sample-style daily admission summary by discipline with inquiry, form, admission, follow-up, and file status details.
              </p>
            </div>
            <button
              onClick={downloadCollegeCompleteReport}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" /> Download CSV
            </button>
          </div>

          {!isCollegeScope && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
              This report is available in College scope only. Switch scope to College to view full data.
            </div>
          )}

          {isCollegeScope && completeReport && (
            <>
              <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 via-indigo-50 to-cyan-50 p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide font-semibold text-blue-700">Daily Admission Summary</p>
                    <h4 className="text-xl font-bold text-gray-900 mt-1">
                      PFY Inquiry vs Admission Summary Sheet {completeReport.sessionLabel || ''}
                    </h4>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Generated</p>
                    <p className="text-sm font-semibold text-gray-800">
                      {completeReport?.generatedAt ? new Date(completeReport.generatedAt).toLocaleString() : '-'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <p className="text-xs text-gray-500">Session</p>
                  <p className="text-2xl font-bold text-gray-900">{completeReport.sessionLabel || '-'}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <p className="text-xs text-gray-500">Disciplines</p>
                  <p className="text-2xl font-bold text-blue-600">{safeList(completeReport.rows).length}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <p className="text-xs text-gray-500">Total Inquiries</p>
                  <p className="text-2xl font-bold text-purple-600">{completeReport?.totals?.inquiryToDate || 0}</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-4">
                  <p className="text-xs text-gray-500">Admissions To Date</p>
                  <p className="text-2xl font-bold text-green-600">{completeReport?.totals?.admissionToDate || 0}</p>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold px-2 py-1 rounded bg-blue-100 text-blue-700">Inquiry Detail</span>
                  <span className="text-[11px] font-semibold px-2 py-1 rounded bg-purple-100 text-purple-700">Admission Form Acquisition</span>
                  <span className="text-[11px] font-semibold px-2 py-1 rounded bg-emerald-100 text-emerald-700">Admission Status</span>
                  <span className="text-[11px] font-semibold px-2 py-1 rounded bg-amber-100 text-amber-700">Inquiry File Entries</span>
                  <span className="text-[11px] font-semibold px-2 py-1 rounded bg-cyan-100 text-cyan-700">Follow-up Calls</span>
                  <span className="text-[11px] font-semibold px-2 py-1 rounded bg-rose-100 text-rose-700">Admission File Status</span>
                </div>

                <div className="overflow-auto max-h-[34rem]">
                  <table className="min-w-[1320px] w-full text-xs">
                  <thead>
                    <tr className="border-b text-gray-700 sticky top-0 z-20">
                      <th className="px-2 py-2 bg-gray-100" rowSpan={2}>SR #</th>
                      <th className="px-2 py-2 bg-gray-100 text-left" rowSpan={2}>Discipline</th>
                      <th className="px-2 py-2 bg-blue-100 text-blue-800" colSpan={4}>Inquiry Detail</th>
                      <th className="px-2 py-2 bg-purple-100 text-purple-800" colSpan={5}>Admission Form Acquisition</th>
                      <th className="px-2 py-2 bg-emerald-100 text-emerald-800" colSpan={4}>Admission Status</th>
                      <th className="px-2 py-2 bg-amber-100 text-amber-800" colSpan={2}>Inquiry File Entries</th>
                      <th className="px-2 py-2 bg-cyan-100 text-cyan-800" colSpan={3}>Follow-up Calls</th>
                      <th className="px-2 py-2 bg-rose-100 text-rose-800" colSpan={2}>Admission File (Forms) Status</th>
                    </tr>
                    <tr className="border-b text-gray-600 sticky top-[33px] z-10">
                      <th className="px-2 py-2 bg-blue-50">Boys</th>
                      <th className="px-2 py-2 bg-blue-50">Girls</th>
                      <th className="px-2 py-2 bg-blue-50">Today</th>
                      <th className="px-2 py-2 bg-blue-50">To Date</th>
                      <th className="px-2 py-2 bg-purple-50">Boys</th>
                      <th className="px-2 py-2 bg-purple-50">Girls</th>
                      <th className="px-2 py-2 bg-purple-50">Today Paid</th>
                      <th className="px-2 py-2 bg-purple-50">To Date Paid</th>
                      <th className="px-2 py-2 bg-purple-50">To Date Unpaid</th>
                      <th className="px-2 py-2 bg-emerald-50">Boys</th>
                      <th className="px-2 py-2 bg-emerald-50">Girls</th>
                      <th className="px-2 py-2 bg-emerald-50">Today</th>
                      <th className="px-2 py-2 bg-emerald-50">To Date</th>
                      <th className="px-2 py-2 bg-amber-50">ERP</th>
                      <th className="px-2 py-2 bg-amber-50">SOFT-W</th>
                      <th className="px-2 py-2 bg-cyan-50">INFO-INQ</th>
                      <th className="px-2 py-2 bg-cyan-50">SCH-DATA</th>
                      <th className="px-2 py-2 bg-cyan-50">To Date</th>
                      <th className="px-2 py-2 bg-rose-50">Boys</th>
                      <th className="px-2 py-2 bg-rose-50">Girls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {safeList(completeReport.rows).map((row, idx) => (
                      <tr key={row.id || `${row.discipline}-${idx}`} className="border-b hover:bg-blue-50/40 even:bg-gray-50/40">
                        <td className="px-2 py-2 text-center">{idx + 1}</td>
                        <td className="px-2 py-2 font-medium text-gray-900">{row.discipline}</td>
                        <td className="px-2 py-2 text-center">{row.inquiryBoys}</td>
                        <td className="px-2 py-2 text-center">{row.inquiryGirls}</td>
                        <td className="px-2 py-2 text-center">{row.inquiryToday}</td>
                        <td className="px-2 py-2 text-center">{row.inquiryToDate}</td>
                        <td className="px-2 py-2 text-center">{row.formBoys}</td>
                        <td className="px-2 py-2 text-center">{row.formGirls}</td>
                        <td className="px-2 py-2 text-center">{row.formTodayPaid}</td>
                        <td className="px-2 py-2 text-center">{row.formToDatePaid}</td>
                        <td className="px-2 py-2 text-center">{row.formToDateUnpaid}</td>
                        <td className="px-2 py-2 text-center">{row.admissionBoys}</td>
                        <td className="px-2 py-2 text-center">{row.admissionGirls}</td>
                        <td className="px-2 py-2 text-center">{row.admissionToday}</td>
                        <td className="px-2 py-2 text-center">{row.admissionToDate}</td>
                        <td className="px-2 py-2 text-center">{row.inquiryFileERP}</td>
                        <td className="px-2 py-2 text-center">{row.inquiryFileSoftW}</td>
                        <td className="px-2 py-2 text-center">{row.followUpTodayInfoInq}</td>
                        <td className="px-2 py-2 text-center">{row.followUpTodaySchData}</td>
                        <td className="px-2 py-2 text-center">{row.followUpToDate}</td>
                        <td className="px-2 py-2 text-center">{row.admissionFileBoys}</td>
                        <td className="px-2 py-2 text-center">{row.admissionFileGirls}</td>
                      </tr>
                    ))}
                    {completeReport?.totals && (
                      <tr className="bg-gray-900 text-white font-semibold">
                        <td className="px-2 py-2 text-center">-</td>
                        <td className="px-2 py-2">{completeReport.totals.discipline || 'GRAND TOTAL'}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.inquiryBoys || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.inquiryGirls || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.inquiryToday || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.inquiryToDate || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.formBoys || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.formGirls || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.formTodayPaid || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.formToDatePaid || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.formToDateUnpaid || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.admissionBoys || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.admissionGirls || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.admissionToday || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.admissionToDate || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.inquiryFileERP || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.inquiryFileSoftW || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.followUpTodayInfoInq || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.followUpTodaySchData || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.followUpToDate || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.admissionFileBoys || 0}</td>
                        <td className="px-2 py-2 text-center">{completeReport.totals.admissionFileGirls || 0}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>

            </>
          )}
        </div>
      )}

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
              <p className="text-xs text-gray-500">Conversion Rate (This Month)</p>
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
                {safeList(admissionStats.bySource).sort((a, b) => b.count - a.count).map((s) => {
                  const max = Math.max(...safeList(admissionStats.bySource).map(x => x.count), 1);
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
                <BarChart data={safeList(commStats.dailyData)}>
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
                {safeList(commStats.byType).sort((a, b) => b.count - a.count).map((t) => {
                  const max = Math.max(...safeList(commStats.byType).map(x => x.count), 1);
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
              {safeList(commStats.staffComms).length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-gray-900 mt-6 mb-3">By Staff</h4>
                  <div className="space-y-2">
                    {[...safeList(commStats.staffComms)].sort((a, b) => b.count - a.count).map(s => (
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
                  {safeList(staffPerformance).map(s => (
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
