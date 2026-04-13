import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { isSuperAdmin } from '../utils/roleUtils';
import PageHeader from '../components/ui/PageHeader';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import EmptyState from '../components/ui/EmptyState';
import SearchInput from '../components/ui/SearchInput';
import Pagination from '../components/ui/Pagination';
import Badge from '../components/ui/Badge';
import CampusTypeTabs from '../components/ui/CampusTypeTabs';

const PAGE_SIZE = 20;

function campusTypeLabel(campusType) {
  return campusType === 'college' ? 'College' : 'School';
}

export default function Students() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [campuses, setCampuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [campusFilter, setCampusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [campusType, setCampusType] = useState(() => (isSuperAdmin(user) ? 'all' : (user?.campus?.campus_type || 'school')));

  useEffect(() => {
    if (isSuperAdmin(user)) {
      setCampusType(prev => (prev === 'school' || prev === 'college' || prev === 'all' ? prev : 'all'));
      return;
    }
    setCampusType(user?.campus?.campus_type || 'school');
  }, [user?.id, user?.role, user?.campus?.campus_type]);

  useEffect(() => {
    loadCampuses();
  }, []);

  useEffect(() => {
    loadStudents();
  }, [campusType, user?.id, user?.role]);

  useEffect(() => {
    setCampusFilter('all');
  }, [campusType]);

  useEffect(() => {
    setPage(1);
  }, [search, activeFilter, campusFilter, campusType]);

  async function loadCampuses() {
    try {
      const res = await api.get('/campuses', { params: { is_active: true } });
      setCampuses(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Load campuses error:', err);
    }
  }

  async function loadStudents() {
    setLoading(true);
    setError('');
    try {
      const params = { role: 'student' };
      if (isSuperAdmin(user) && campusType !== 'all') {
        params.campus_type = campusType;
      }
      const res = await api.get('/users', { params });
      setStudents(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Load students error:', err);
      setError(err.response?.data?.error || 'Unable to load students.');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredCampuses = useMemo(() => {
    if (!isSuperAdmin(user)) {
      return campuses.filter(c => String(c.id) === String(user?.campus_id));
    }
    if (campusType === 'all') return campuses;
    return campuses.filter(c => (c.campus_type || 'school') === campusType);
  }, [campuses, campusType, user]);

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      if (activeFilter === 'active' && !student.is_active) return false;
      if (activeFilter === 'inactive' && student.is_active) return false;

      if (campusFilter !== 'all' && String(student.campus_id || '') !== String(campusFilter)) {
        return false;
      }

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = `${student.name || ''} ${student.email || ''} ${student.phone || ''} ${student.campus?.name || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [students, activeFilter, campusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedStudents = filteredStudents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totalStudents = students.length;
  const activeStudents = students.filter(s => s.is_active).length;
  const schoolStudents = students.filter(s => (s.campus?.campus_type || 'school') === 'school').length;
  const collegeStudents = students.filter(s => (s.campus?.campus_type || 'school') === 'college').length;
  const isAllCampuses = isSuperAdmin(user) && campusType === 'all';
  const scopedTypeLabel = campusTypeLabel(campusType === 'all' ? (user?.campus?.campus_type || 'school') : campusType);
  const scopedStudents = (campusType === 'college') ? collegeStudents : schoolStudents;

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle={`${filteredStudents.length} students shown${isSuperAdmin(user) ? ` · ${campusType === 'all' ? 'All Campuses' : campusTypeLabel(campusType)}` : ''}`}
      />

      {isSuperAdmin(user) && (
        <CampusTypeTabs value={campusType} onChange={setCampusType} includeAll className="mb-4" />
      )}

      <div className={`grid grid-cols-2 ${isAllCampuses ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4 mb-6`}>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Total Students</p>
          <p className="text-2xl font-bold text-gray-900">{totalStudents}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500">Active</p>
          <p className="text-2xl font-bold text-green-600">{activeStudents}</p>
        </div>
        {isAllCampuses ? (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs text-gray-500">School</p>
              <p className="text-2xl font-bold text-blue-600">{schoolStudents}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs text-gray-500">College</p>
              <p className="text-2xl font-bold text-purple-600">{collegeStudents}</p>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs text-gray-500">{scopedTypeLabel}</p>
            <p className={`text-2xl font-bold ${campusType === 'college' ? 'text-purple-600' : 'text-blue-600'}`}>{scopedStudents}</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 space-y-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name, email, phone, campus..."
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={activeFilter}
              onChange={e => setActiveFilter(e.target.value)}
              className="rounded-lg border border-gray-300 py-2 px-3 text-sm outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <select
              value={campusFilter}
              onChange={e => setCampusFilter(e.target.value)}
              className="rounded-lg border border-gray-300 py-2 px-3 text-sm outline-none"
              disabled={filteredCampuses.length === 0}
            >
              <option value="all">All Campuses</option>
              {filteredCampuses.map(campus => (
                <option key={campus.id} value={campus.id}>{campus.name}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={loadStudents}
              className="rounded-lg border border-gray-300 py-2 px-3 text-sm text-gray-700 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 border-b border-red-100 bg-red-50 text-sm text-red-700">
            {error}
          </div>
        )}

        {paginatedStudents.length === 0 ? (
          <EmptyState title="No students found" message="Try changing filters or search terms." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase border-b">
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Campus</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginatedStudents.map(student => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{student.name}</p>
                      <p className="text-xs text-gray-400">{student.email || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{student.phone || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{student.campus?.name || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge color={(student.campus?.campus_type || 'school') === 'college' ? 'blue' : 'gray'}>
                        {campusTypeLabel(student.campus?.campus_type)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={student.is_active ? 'green' : 'red'}>
                        {student.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
