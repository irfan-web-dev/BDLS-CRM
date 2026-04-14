import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit2, ArrowUp, ArrowDown } from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { isAdminOrAbove, isSuperAdmin } from '../../utils/roleUtils';
import { formatDate, isOverdue } from '../../utils/helpers';
import { INQUIRY_STATUSES, PRIORITIES, GENDERS } from '../../utils/constants';
import PageHeader from '../../components/ui/PageHeader';
import SearchInput from '../../components/ui/SearchInput';
import FilterBar from '../../components/ui/FilterBar';
import Pagination from '../../components/ui/Pagination';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import { InquiryStatusBadge, PriorityBadge } from '../../components/ui/StatusBadge';

export default function InquiryList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [inquiries, setInquiries] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);

  // Load filter options
  const [campuses, setCampuses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [sources, setSources] = useState([]);
  const [staff, setStaff] = useState([]);
  const [areas, setAreas] = useState([]);
  const [previousInstitutes, setPreviousInstitutes] = useState([]);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  const selectedCampusIds = (filters.campus_id || []).map(String);
  const selectedCampuses = campuses.filter(c => selectedCampusIds.includes(String(c.id)));
  const isCollegeContext = user?.campus?.campus_type === 'college' || (
    isSuperAdmin(user) && (
      selectedCampusIds.length > 0
        ? selectedCampuses.length > 0 && selectedCampuses.every(c => c.campus_type === 'college')
        : campuses.length > 0 && campuses.every(c => c.campus_type === 'college')
    )
  );

  useEffect(() => {
    if (!isCollegeContext) {
      setFilters(prev => {
        const next = { ...prev };
        delete next.followup_filter;
        delete next.previous_institute;
        delete next.area;
        delete next.gender;
        delete next.marks_sort;
        return next;
      });
    }
  }, [isCollegeContext]);

  useEffect(() => {
    loadInquiries();
  }, [search, filters, page]);

  async function loadFilterOptions() {
    try {
      const [campRes, classRes, srcRes, optionRes] = await Promise.all([
        api.get('/campuses'),
        api.get('/classes'),
        api.get('/settings/inquiry-sources'),
        api.get('/inquiries/filter-options'),
      ]);
      setCampuses(campRes.data);
      setClasses(classRes.data);
      setSources(srcRes.data);
      setAreas(optionRes.data.areas || []);
      setPreviousInstitutes(optionRes.data.previous_institutes || []);

      if (isAdminOrAbove(user)) {
        const staffRes = await api.get('/users/staff/available');
        setStaff(staffRes.data);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadInquiries() {
    setLoading(true);
    try {
      const params = { page, limit: 20, search };
      if (filters.marks_sort === 'DESC') {
        params.sort_by = 'previous_marks_obtained';
        params.sort_order = 'DESC';
      } else if (filters.marks_sort === 'ASC') {
        params.sort_by = 'previous_marks_obtained';
        params.sort_order = 'ASC';
      }

      const followupFilter = Array.isArray(filters.followup_filter) ? filters.followup_filter[0] : null;
      if (followupFilter) {
        params.followup_filter = followupFilter;
      }

      // Convert array filters to comma-separated strings
      Object.entries(filters).forEach(([k, v]) => {
        if (k === 'marks_sort' || k === 'followup_filter') return;
        if (Array.isArray(v) && v.length > 0) {
          params[k] = v.join(',');
        } else if (v && !Array.isArray(v)) {
          params[k] = v;
        }
      });
      Object.keys(params).forEach(k => {
        if (!params[k]) delete params[k];
      });
      const res = await api.get('/inquiries', { params });
      setInquiries(res.data.inquiries);
      setPagination(res.data.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filterConfig = [
    { key: 'status', label: 'All Statuses', options: INQUIRY_STATUSES.map(s => ({ value: s.value, label: s.label })) },
    { key: 'priority', label: 'All Priorities', options: PRIORITIES.map(p => ({ value: p.value, label: p.label })) },
    {
      key: 'is_manual_entry',
      label: 'All Entry Types',
      singleSelect: true,
      options: [
        { value: 'true', label: 'Manual Entry' },
        { value: 'false', label: 'Regular Entry' },
      ],
    },
  ];

  if (isSuperAdmin(user)) {
    filterConfig.push({ key: 'campus_id', label: 'All Campuses', options: campuses.map(c => ({ value: c.id, label: c.name })) });
  }

  if (isCollegeContext) {
    filterConfig.push(
      {
        key: 'followup_filter',
        label: 'Follow-up',
        singleSelect: true,
        options: [
          { value: 'today', label: "Today's Follow-ups" },
          { value: 'overdue', label: 'Overdue Follow-ups' },
          { value: 'tomorrow', label: "Tomorrow's Follow-ups" },
          { value: 'next_7_days', label: 'Next 7 Days' },
          { value: 'no_date', label: 'No Follow-up Date' },
        ],
      },
      { key: 'gender', label: 'All Genders', options: GENDERS.map(g => ({ value: g.value, label: g.label })) },
      { key: 'area', label: 'All Areas', options: areas.map(a => ({ value: a, label: a })) },
      { key: 'previous_institute', label: 'All Previous Institutes', options: previousInstitutes.map(i => ({ value: i, label: i })) },
    );
  }

  filterConfig.push(
    { key: 'class_id', label: 'All Classes', options: classes.map(c => ({ value: c.id, label: c.name })) },
    { key: 'source_id', label: 'All Sources', options: sources.map(s => ({ value: s.id, label: s.name })) },
  );

  if (isAdminOrAbove(user)) {
    filterConfig.push({ key: 'assigned_staff_id', label: 'All Staff', options: staff.map(s => ({ value: s.id, label: s.name })) });
  }

  function handleRowClick(e, id) {
    // Don't navigate if user clicked on the edit button
    if (e.target.closest('[data-action]')) return;
    navigate(`/inquiries/${id}`);
  }

  return (
    <div>
      <PageHeader
        title="Inquiries"
        subtitle={`${pagination.total || 0} total inquiries`}
        action={
          <Link
            to="/inquiries/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Inquiry</span>
            <span className="sm:hidden">New</span>
          </Link>
        }
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {/* Search & Filters */}
        <div className="p-3 sm:p-4 space-y-3 border-b border-gray-100">
          <SearchInput
            value={search}
            onChange={(val) => { setSearch(val); setPage(1); }}
            placeholder="Search student, parent, or phone..."
          />
          <FilterBar
            filters={filterConfig}
            values={filters}
            onChange={(key, val) => { setFilters(prev => ({ ...prev, [key]: val })); setPage(1); }}
            onClear={() => { setFilters({}); setPage(1); }}
          />
          {isCollegeContext && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs sm:text-sm text-gray-500">Marks Sort</span>
              <button
                type="button"
                onClick={() => {
                  setFilters(prev => ({
                    ...prev,
                    marks_sort: prev.marks_sort === 'ASC' ? undefined : 'ASC',
                  }));
                  setPage(1);
                }}
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  filters.marks_sort === 'ASC'
                    ? 'border-primary-300 bg-primary-50 text-primary-700'
                    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                }`}
                title="Marks: Low to High"
              >
                <ArrowUp className="h-3.5 w-3.5" />
                <span>Low to High</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilters(prev => ({
                    ...prev,
                    marks_sort: prev.marks_sort === 'DESC' ? undefined : 'DESC',
                  }));
                  setPage(1);
                }}
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  filters.marks_sort === 'DESC'
                    ? 'border-primary-300 bg-primary-50 text-primary-700'
                    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                }`}
                title="Marks: High to Low"
              >
                <ArrowDown className="h-3.5 w-3.5" />
                <span>High to Low</span>
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <LoadingSpinner />
        ) : inquiries.length === 0 ? (
          <EmptyState
            title="No inquiries found"
            message="Try adjusting your search or filters"
            action={
              <Link to="/inquiries/new" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                Create first inquiry
              </Link>
            }
          />
        ) : (
          <>
            {/* Mobile: Card Layout */}
            <div className="lg:hidden divide-y divide-gray-100">
              {inquiries.map(inq => (
                <div
                  key={inq.id}
                  onClick={(e) => handleRowClick(e, inq.id)}
                  className="p-4 active:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 truncate">{inq.student_name}</p>
                      <p className="text-sm text-gray-500 truncate">{inq.parent_name} &middot; {inq.parent_phone}</p>
                    </div>
                    <button
                      data-action="edit"
                      onClick={(e) => { e.stopPropagation(); navigate(`/inquiries/${inq.id}/edit`); }}
                      className="rounded p-1.5 hover:bg-gray-100 text-gray-400 flex-shrink-0"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <InquiryStatusBadge status={inq.status} />
                    <PriorityBadge priority={inq.priority} />
                    {inq.is_manual_entry && (
                      <span className="text-xs bg-blue-100 text-blue-700 rounded px-2 py-0.5 font-medium">
                        Manual
                      </span>
                    )}
                    {inq.classApplying && (
                      <span className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-0.5">{inq.classApplying.name}</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                    <span>{formatDate(inq.inquiry_date)}</span>
                    <div className="flex items-center gap-3">
                      {inq.next_follow_up_date && (
                        <span className={isOverdue(inq.next_follow_up_date) ? 'text-red-600 font-medium' : ''}>
                          F/U: {formatDate(inq.next_follow_up_date)}
                        </span>
                      )}
                      {!inq.next_follow_up_date && inq.was_ever_overdue && (
                        <span className="text-emerald-700 font-medium">
                          Previously overdue
                        </span>
                      )}
                      {inq.assignedStaff && <span>{inq.assignedStaff.name}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Table Layout */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Parent</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Class</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Follow-up</th>
                    <th className="px-4 py-3">Assigned</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {inquiries.map(inq => (
                    <tr
                      key={inq.id}
                      onClick={(e) => handleRowClick(e, inq.id)}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{inq.student_name}</span>
                        <p className="text-xs text-gray-400">{formatDate(inq.inquiry_date)}</p>
                        {inq.is_manual_entry && (
                          <span className="inline-flex mt-1 text-[11px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 font-medium">
                            Manual
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{inq.parent_name}</td>
                      <td className="px-4 py-3 text-gray-600">{inq.parent_phone}</td>
                      <td className="px-4 py-3 text-gray-600">{inq.classApplying?.name}</td>
                      <td className="px-4 py-3"><InquiryStatusBadge status={inq.status} /></td>
                      <td className="px-4 py-3"><PriorityBadge priority={inq.priority} /></td>
                      <td className="px-4 py-3">
                        {inq.next_follow_up_date ? (
                          <div className="flex flex-col">
                            <span className={`text-xs ${isOverdue(inq.next_follow_up_date) ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {formatDate(inq.next_follow_up_date)}
                            </span>
                            {inq.was_ever_overdue && !isOverdue(inq.next_follow_up_date) && (
                              <span className="text-[11px] text-emerald-700">Recovered overdue</span>
                            )}
                          </div>
                        ) : inq.was_ever_overdue ? (
                          <span className="text-xs text-emerald-700 font-medium">Previously overdue</span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm">{inq.assignedStaff?.name || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          data-action="edit"
                          onClick={(e) => { e.stopPropagation(); navigate(`/inquiries/${inq.id}/edit`); }}
                          className="rounded p-1.5 hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}
