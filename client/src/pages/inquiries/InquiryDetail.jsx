import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Phone, Mail, MapPin, Calendar, User, Edit2, Clock,
  MessageSquare, Plus, ChevronRight,
} from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { formatDate, formatDateTime, relativeTime, isOverdue } from '../../utils/helpers';
import { INQUIRY_STATUSES, FOLLOW_UP_TYPES, INTEREST_LEVELS } from '../../utils/constants';
import { isAdminOrAbove } from '../../utils/roleUtils';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import { InquiryStatusBadge, PriorityBadge } from '../../components/ui/StatusBadge';

const HISTORY_FIELD_LABELS = {
  parent_name: 'Parent Name',
  relationship: 'Relationship',
  parent_phone: 'Parent Phone',
  parent_whatsapp: 'Parent WhatsApp',
  parent_email: 'Parent Email',
  city: 'City',
  area: 'Area',
  student_name: 'Student Name',
  date_of_birth: 'Date of Birth',
  gender: 'Gender',
  student_phone: 'Student Phone',
  class_applying_id: 'Class Applying',
  current_school: 'Current School',
  previous_institute: 'Previous Institute',
  previous_marks_obtained: 'Marks Obtained',
  previous_total_marks: 'Total Marks',
  previous_major_subjects: 'Major Subjects',
  special_needs: 'Special Needs',
  inquiry_date: 'Inquiry Date',
  source_id: 'Source',
  referral_parent_name: 'Referral Parent',
  package_name: 'Package',
  package_amount: 'Package Amount',
  inquiry_form_taken: 'Form Taken',
  campus_id: 'Campus',
  session_preference: 'Session Preference',
  assigned_staff_id: 'Assigned Staff',
  priority: 'Priority',
  status: 'Status',
  status_changed_at: 'Status Changed At',
  interest_level: 'Interest Level',
  last_contact_date: 'Last Contact Date',
  next_follow_up_date: 'Next Follow-up Date',
  was_ever_overdue: 'Was Ever Overdue',
  first_overdue_date: 'First Overdue Date',
  last_overdue_date: 'Last Overdue Date',
  overdue_resolved_count: 'Overdue Resolved Count',
  overdue_last_resolved_at: 'Last Overdue Resolved At',
  is_sibling: 'Sibling Inquiry',
  sibling_of_inquiry_id: 'Linked Sibling Inquiry',
  sibling_group_id: 'Sibling Group',
  notes: 'Notes',
  tag_ids: 'Tags',
};

function formatHistoryKey(key) {
  if (HISTORY_FIELD_LABELS[key]) return HISTORY_FIELD_LABELS[key];
  return String(key || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatHistoryValue(key, value, lookups = {}) {
  if (value === null || value === undefined || value === '') return '-';
  const normalizedKey = String(key || '');
  const {
    campusById = {},
    staffById = {},
    classById = {},
    sourceById = {},
    tagById = {},
  } = lookups;

  const resolveLabel = (map, rawValue) => {
    if (rawValue === null || rawValue === undefined || rawValue === '') return null;
    const mapKey = String(rawValue);
    return map[mapKey] || map[rawValue] || null;
  };

  if (normalizedKey === 'campus_id') {
    const label = resolveLabel(campusById, value);
    return label || `Campus #${value}`;
  }
  if (normalizedKey === 'assigned_staff_id') {
    const label = resolveLabel(staffById, value);
    return label || `Staff #${value}`;
  }
  if (normalizedKey === 'class_applying_id') {
    const label = resolveLabel(classById, value);
    return label || `Class #${value}`;
  }
  if (normalizedKey === 'source_id') {
    const label = resolveLabel(sourceById, value);
    return label || `Source #${value}`;
  }
  if (normalizedKey === 'tag_ids' && Array.isArray(value)) {
    if (!value.length) return '-';
    return value.map((tagId) => resolveLabel(tagById, tagId) || `Tag #${tagId}`).join(', ');
  }
  if (normalizedKey === 'inquiry_form_taken') {
    if (typeof value === 'boolean') return value ? 'Taken' : 'Not Taken';
    const normalizedValue = String(value).toLowerCase();
    if (normalizedValue === 'true') return 'Taken';
    if (normalizedValue === 'false') return 'Not Taken';
    return '-';
  }

  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
  if (typeof value === 'string') {
    if (value.includes('T') && !Number.isNaN(Date.parse(value))) return formatDateTime(value);
    return value.replace(/_/g, ' ');
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function actionLabel(action) {
  if (action === 'inquiry.create') return 'Created';
  if (action === 'inquiry.update') return 'Updated';
  if (action === 'inquiry.status_change') return 'Status Changed';
  if (action === 'inquiry.assign') return 'Assigned';
  if (action === 'inquiry.delete') return 'Deleted';
  return String(action || 'Unknown').replace(/\./g, ' ').replace(/_/g, ' ');
}

function deriveChangedFields(oldValues, newValues) {
  const oldObj = oldValues && typeof oldValues === 'object' ? oldValues : {};
  const newObj = newValues && typeof newValues === 'object' ? newValues : {};
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const changed = {};

  keys.forEach((key) => {
    if (key === 'changed_fields') return;
    const before = oldObj[key];
    const after = newObj[key];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changed[key] = { from: before, to: after };
    }
  });

  return changed;
}

export default function InquiryDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [inquiry, setInquiry] = useState(null);
  const [historyLookups, setHistoryLookups] = useState({
    campusById: {},
    staffById: {},
    classById: {},
    sourceById: {},
    tagById: {},
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [followUpModal, setFollowUpModal] = useState(false);
  const [statusModal, setStatusModal] = useState(false);

  useEffect(() => { loadInquiry(); }, [id]);

  async function loadInquiry() {
    try {
      const res = await api.get(`/inquiries/${id}`, { params: { include_history: true } });
      const inquiryData = res.data;
      setInquiry(inquiryData);

      const [campusesResult, classesResult, sourcesResult, tagsResult, staffResult] = await Promise.allSettled([
        api.get('/campuses'),
        api.get('/classes'),
        api.get('/settings/inquiry-sources'),
        api.get('/settings/inquiry-tags'),
        isAdminOrAbove(user) ? api.get('/users/staff/available') : Promise.resolve({ data: [] }),
      ]);

      const campuses = campusesResult.status === 'fulfilled' && Array.isArray(campusesResult.value?.data)
        ? campusesResult.value.data
        : [];
      const classes = classesResult.status === 'fulfilled' && Array.isArray(classesResult.value?.data)
        ? classesResult.value.data
        : [];
      const sources = sourcesResult.status === 'fulfilled' && Array.isArray(sourcesResult.value?.data)
        ? sourcesResult.value.data
        : [];
      const tags = tagsResult.status === 'fulfilled' && Array.isArray(tagsResult.value?.data)
        ? tagsResult.value.data
        : [];
      const staff = staffResult.status === 'fulfilled' && Array.isArray(staffResult.value?.data)
        ? staffResult.value.data
        : [];

      const campusById = {};
      campuses.forEach((campus) => { campusById[String(campus.id)] = campus.name || `Campus #${campus.id}`; });
      if (inquiryData?.campus?.id) campusById[String(inquiryData.campus.id)] = inquiryData.campus.name || `Campus #${inquiryData.campus.id}`;

      const classById = {};
      classes.forEach((item) => { classById[String(item.id)] = item.name || `Class #${item.id}`; });
      if (inquiryData?.classApplying?.id) classById[String(inquiryData.classApplying.id)] = inquiryData.classApplying.name || `Class #${inquiryData.classApplying.id}`;

      const sourceById = {};
      sources.forEach((item) => { sourceById[String(item.id)] = item.name || `Source #${item.id}`; });
      if (inquiryData?.source?.id) sourceById[String(inquiryData.source.id)] = inquiryData.source.name || `Source #${inquiryData.source.id}`;

      const tagById = {};
      tags.forEach((item) => { tagById[String(item.id)] = item.name || `Tag #${item.id}`; });
      (inquiryData?.tags || []).forEach((item) => { tagById[String(item.id)] = item.name || `Tag #${item.id}`; });

      const staffById = {};
      staff.forEach((item) => { staffById[String(item.id)] = item.name || `Staff #${item.id}`; });
      if (inquiryData?.assignedStaff?.id) staffById[String(inquiryData.assignedStaff.id)] = inquiryData.assignedStaff.name || `Staff #${inquiryData.assignedStaff.id}`;
      if (inquiryData?.createdBy?.id) staffById[String(inquiryData.createdBy.id)] = inquiryData.createdBy.name || `Staff #${inquiryData.createdBy.id}`;
      if (inquiryData?.updatedBy?.id) staffById[String(inquiryData.updatedBy.id)] = inquiryData.updatedBy.name || `Staff #${inquiryData.updatedBy.id}`;
      (inquiryData?.change_history || []).forEach((event) => {
        if (event?.user?.id) {
          staffById[String(event.user.id)] = event.user.name || `Staff #${event.user.id}`;
        }
      });

      setHistoryLookups({ campusById, staffById, classById, sourceById, tagById });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (!inquiry) return <div className="text-center py-12 text-gray-500">Inquiry not found</div>;

  return (
    <div>
      <PageHeader
        title={inquiry.student_name}
        subtitle={`Inquiry #${inquiry.id} — ${inquiry.parent_name}`}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setStatusModal(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Update Status
            </button>
            <button
              onClick={() => setFollowUpModal(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              <Plus className="h-4 w-4" />
              Log Follow-up
            </button>
            <Link
              to={`/inquiries/${id}/edit`}
              className="inline-flex items-center gap-1 rounded-lg bg-white border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Edit2 className="h-4 w-4" />
              Edit
            </Link>
          </div>
        }
      />

      {/* Status Pipeline */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {INQUIRY_STATUSES.slice(0, 10).map((s, i) => {
            const isCurrent = inquiry.status === s.value;
            const isPast = INQUIRY_STATUSES.findIndex(st => st.value === inquiry.status) > i;
            const colorMap = { blue: 'bg-blue-500', yellow: 'bg-yellow-500', green: 'bg-green-500' };
            return (
              <div key={s.value} className="flex items-center">
                <div className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                  isCurrent ? `${colorMap[s.color] || 'bg-gray-500'} text-white` :
                  isPast ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  <span className="whitespace-nowrap">{s.label}</span>
                </div>
                {i < 9 && <ChevronRight className="h-3 w-3 text-gray-300 mx-0.5 shrink-0" />}
              </div>
            );
          })}
        </div>
        {['deferred', 'not_interested', 'no_response', 'lost'].includes(inquiry.status) && (
          <div className="mt-2">
            <InquiryStatusBadge status={inquiry.status} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {['overview', 'followUps', 'activity'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'overview' ? 'Overview' : tab === 'followUps' ? `Follow-ups (${inquiry.followUps?.length || 0})` : 'Activity'}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab inquiry={inquiry} historyLookups={historyLookups} />}
      {activeTab === 'followUps' && <FollowUpsTab followUps={inquiry.followUps || []} historyLookups={historyLookups} />}
      {activeTab === 'activity' && <ActivityTab inquiry={inquiry} historyLookups={historyLookups} />}

      {/* Follow-up Modal */}
      <FollowUpModal
        isOpen={followUpModal}
        onClose={() => setFollowUpModal(false)}
        inquiryId={inquiry.id}
        onSuccess={loadInquiry}
      />

      {/* Status Modal */}
      <StatusModal
        isOpen={statusModal}
        onClose={() => setStatusModal(false)}
        inquiry={inquiry}
        onSuccess={loadInquiry}
      />
    </div>
  );
}

function OverviewTab({ inquiry, historyLookups }) {
  const isCollegeInquiry = inquiry?.campus?.campus_type === 'college';
  const createdAt = inquiry?.created_at || inquiry?.createdAt;
  const updatedAt = inquiry?.updated_at || inquiry?.updatedAt || createdAt;
  const createdByName = inquiry?.createdBy?.name || '-';
  const updatedByName = inquiry?.updatedBy?.name || createdByName;
  const history = Array.isArray(inquiry?.change_history) ? inquiry.change_history : [];
  const overdueHistoryLabel = inquiry?.was_ever_overdue
    ? `Yes${inquiry?.overdue_resolved_count ? ` (${inquiry.overdue_resolved_count} resolved)` : ''}`
    : 'No';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Parent Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Parent Information</h3>
        <div className="space-y-3">
          <InfoRow icon={User} label="Name" value={`${inquiry.parent_name} (${inquiry.relationship})`} />
          <InfoRow icon={Phone} label="Phone" value={inquiry.parent_phone} />
          {inquiry.parent_whatsapp && <InfoRow icon={MessageSquare} label="WhatsApp" value={inquiry.parent_whatsapp} />}
          {inquiry.parent_email && <InfoRow icon={Mail} label="Email" value={inquiry.parent_email} />}
          {(inquiry.city || inquiry.area) && <InfoRow icon={MapPin} label="Location" value={[inquiry.area, inquiry.city].filter(Boolean).join(', ')} />}
        </div>
      </div>

      {/* Student Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Student Information</h3>
        <div className="space-y-3">
          <InfoRow label="Name" value={inquiry.student_name} />
          {inquiry.date_of_birth && <InfoRow icon={Calendar} label="Date of Birth" value={formatDate(inquiry.date_of_birth)} />}
          {inquiry.gender && <InfoRow label="Gender" value={inquiry.gender} />}
          <InfoRow label={isCollegeInquiry ? 'Discipline' : 'Applying For'} value={inquiry.classApplying?.name} />
          {inquiry.student_phone && <InfoRow label="Student Phone" value={inquiry.student_phone} />}
          {isCollegeInquiry ? (
            <>
              {inquiry.previous_institute && <InfoRow label="Previous Institute" value={inquiry.previous_institute} />}
              {(inquiry.previous_marks_obtained !== null && inquiry.previous_marks_obtained !== undefined) && <InfoRow label="Marks Obtained" value={inquiry.previous_marks_obtained} />}
              {(inquiry.previous_total_marks !== null && inquiry.previous_total_marks !== undefined) && <InfoRow label="Total Marks" value={inquiry.previous_total_marks} />}
              {inquiry.previous_major_subjects && <InfoRow label="Major Subjects" value={inquiry.previous_major_subjects} />}
            </>
          ) : (
            inquiry.current_school && <InfoRow label="Current School" value={inquiry.current_school} />
          )}
          {inquiry.special_needs && <InfoRow label="Special Needs" value={inquiry.special_needs} />}
        </div>
      </div>

      {/* Inquiry Details */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Inquiry Details</h3>
        <div className="space-y-3">
          <InfoRow label="Date" value={formatDate(inquiry.inquiry_date)} />
          <InfoRow label="Source" value={inquiry.source?.name || '-'} />
          {inquiry.referral_parent_name && <InfoRow label="Referred By" value={inquiry.referral_parent_name} />}
          <InfoRow label="Campus" value={inquiry.campus?.name} />
          {isCollegeInquiry && inquiry.package_name && <InfoRow label="Package" value={inquiry.package_name} />}
          {isCollegeInquiry && (inquiry.package_amount !== null && inquiry.package_amount !== undefined) && <InfoRow label="Package Amount" value={inquiry.package_amount} />}
          {isCollegeInquiry && inquiry.inquiry_form_taken !== null && inquiry.inquiry_form_taken !== undefined && (
            <InfoRow label="Form Taken" value={inquiry.inquiry_form_taken ? 'Taken' : 'Not Taken'} />
          )}
          {inquiry.session_preference && <InfoRow label="Session" value={inquiry.session_preference} />}
          <InfoRow label="Assigned To" value={inquiry.assignedStaff?.name || 'Unassigned'} />
          <InfoRow label="Overdue History" value={overdueHistoryLabel} />
          {inquiry.was_ever_overdue && inquiry.first_overdue_date && (
            <InfoRow label="First Overdue" value={formatDate(inquiry.first_overdue_date)} />
          )}
          {inquiry.was_ever_overdue && inquiry.last_overdue_date && (
            <InfoRow label="Last Overdue" value={formatDate(inquiry.last_overdue_date)} />
          )}
          {inquiry.was_ever_overdue && inquiry.overdue_last_resolved_at && (
            <InfoRow label="Last Overdue Resolved" value={formatDateTime(inquiry.overdue_last_resolved_at)} />
          )}
          <InfoRow label="Sibling Inquiry" value={inquiry.is_sibling ? 'Yes' : 'No'} />
          {inquiry.siblingOf?.id && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Linked Sibling</span>
              <Link to={`/inquiries/${inquiry.siblingOf.id}`} className="text-sm font-medium text-primary-600 hover:text-primary-700">
                #{inquiry.siblingOf.id} - {inquiry.siblingOf.student_name || 'Open'}
              </Link>
            </div>
          )}
          {Array.isArray(inquiry.linked_siblings) && inquiry.linked_siblings.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Related Siblings</p>
              <div className="space-y-1">
                {inquiry.linked_siblings.slice(0, 5).map((sibling) => (
                  <Link
                    key={sibling.id}
                    to={`/inquiries/${sibling.id}`}
                    className="block text-xs text-primary-600 hover:text-primary-700"
                  >
                    #{sibling.id} - {sibling.student_name || '-'} ({sibling.classApplying?.name || 'Class/Discipline'})
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Priority</span>
            <PriorityBadge priority={inquiry.priority} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Interest Level</span>
            {inquiry.interest_level ? (
              <Badge color={INTEREST_LEVELS.find(i => i.value === inquiry.interest_level)?.color}>
                {INTEREST_LEVELS.find(i => i.value === inquiry.interest_level)?.label}
              </Badge>
            ) : <span className="text-xs text-gray-400">-</span>}
          </div>
        </div>
      </div>

      {/* Tags & Notes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Tags & Notes</h3>
        {inquiry.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {inquiry.tags.map(tag => (
              <Badge key={tag.id} color="blue">{tag.name}</Badge>
            ))}
          </div>
        )}
        {inquiry.notes ? (
          <p className="text-sm text-gray-600">{inquiry.notes}</p>
        ) : (
          <p className="text-sm text-gray-400">No notes</p>
        )}
        <div className="mt-4 pt-4 border-t text-xs text-gray-400 space-y-1">
          <p>Created by {createdByName} on {formatDateTime(createdAt)}</p>
          <p>Last updated by {updatedByName} on {formatDateTime(updatedAt)}</p>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Update History
          </p>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">No update history available.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto pr-1 space-y-2">
              {history.map((event) => {
                const previousState = event?.old_values && typeof event.old_values === 'object'
                  ? event.old_values
                  : {};
                const nextState = event?.new_values && typeof event.new_values === 'object'
                  ? event.new_values
                  : {};
                const explicitChanges = nextState?.changed_fields && typeof nextState.changed_fields === 'object'
                  ? nextState.changed_fields
                  : null;
                const changedFields = explicitChanges && Object.keys(explicitChanges).length
                  ? explicitChanges
                  : deriveChangedFields(previousState, nextState);
                const changedEntries = Object.entries(changedFields);

                return (
                  <div key={event.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-700">
                        {actionLabel(event.action)}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {event.user?.name ? `By ${event.user.name} | ` : ''}
                        {formatDateTime(event.created_at)}
                      </p>
                    </div>

                    {changedEntries.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {changedEntries.map(([key, values]) => (
                          <p key={`${event.id}-${key}`} className="text-xs text-gray-600">
                            <span className="font-medium">{formatHistoryKey(key)}:</span>{' '}
                            {formatHistoryValue(key, values?.from, historyLookups)} {'->'} {formatHistoryValue(key, values?.to, historyLookups)}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-gray-400">No field-level changes captured.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-gray-400" />}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <span className="text-sm text-gray-900 font-medium">{value || '-'}</span>
    </div>
  );
}

function FollowUpsTab({ followUps, historyLookups }) {
  if (followUps.length === 0) {
    return <p className="text-center py-8 text-gray-400">No follow-ups recorded yet</p>;
  }

  return (
    <div className="space-y-4">
      {[...followUps].sort((a, b) => new Date(b.follow_up_date) - new Date(a.follow_up_date)).map((fu) => {
        const typeLabel = FOLLOW_UP_TYPES.find(t => t.value === fu.type)?.label || fu.type;
        const interestLabel = INTEREST_LEVELS.find(i => i.value === fu.interest_level);
        const createdAt = fu.created_at || fu.createdAt || fu.follow_up_date;
        const updatedAt = fu.updated_at || fu.updatedAt || createdAt;
        const followUpHistory = Array.isArray(fu.change_history) ? fu.change_history : [];
        const followUpLookups = {
          ...historyLookups,
          staffById: {
            ...(historyLookups?.staffById || {}),
            ...(fu?.staff?.id ? { [String(fu.staff.id)]: fu.staff.name || `Staff #${fu.staff.id}` } : {}),
          },
          inquiryById: {
            ...(fu?.inquiry_id ? { [String(fu.inquiry_id)]: `Inquiry #${fu.inquiry_id}` } : {}),
          },
        };

        return (
          <div key={fu.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge color="blue">{typeLabel}</Badge>
                {fu.duration_minutes && <span className="text-xs text-gray-400">{fu.duration_minutes} min</span>}
              </div>
              <span className="text-xs text-gray-400">{formatDateTime(fu.follow_up_date)}</span>
            </div>
            {fu.notes ? (
              <p className="text-sm text-gray-700 mb-2">{fu.notes}</p>
            ) : (
              <p className="text-sm text-gray-400 mb-2">No follow-up notes provided.</p>
            )}

            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span>By: {fu.staff?.name || '-'}</span>
              {interestLabel && <Badge color={interestLabel.color}>{interestLabel.label}</Badge>}
              {fu.next_action && <span>Next: {fu.next_action}</span>}
              {fu.next_action_date && (
                <span className={isOverdue(fu.next_action_date) ? 'text-red-600 font-medium' : ''}>
                  Due: {formatDate(fu.next_action_date)}
                </span>
              )}
              {fu.was_on_time !== null && fu.was_on_time !== undefined && (
                <span className={fu.was_on_time ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                  {fu.was_on_time ? 'On Time' : 'Late'}
                </span>
              )}
              <span>Created: {formatDateTime(createdAt)}</span>
              <span>Updated: {formatDateTime(updatedAt)}</span>
            </div>

            <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">History</p>
              {followUpHistory.length === 0 ? (
                <p className="text-xs text-gray-400">No history available for this follow-up.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
                  {followUpHistory.map((event) => {
                    const previousState = event?.old_values && typeof event.old_values === 'object' ? event.old_values : {};
                    const nextState = event?.new_values && typeof event.new_values === 'object' ? event.new_values : {};
                    const explicitChanges = nextState?.changed_fields && typeof nextState.changed_fields === 'object'
                      ? nextState.changed_fields
                      : null;
                    const changedFields = explicitChanges && Object.keys(explicitChanges).length
                      ? explicitChanges
                      : deriveChangedFields(previousState, nextState);
                    const changedEntries = Object.entries(changedFields);

                    return (
                      <div key={event.id} className="rounded border border-gray-200 bg-white p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-700">{actionLabel(event.action)}</p>
                          <p className="text-[11px] text-gray-500">
                            {event.user?.name ? `By ${event.user.name} | ` : ''}
                            {formatDateTime(event.created_at)}
                          </p>
                        </div>

                        {changedEntries.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {changedEntries.map(([key, values]) => (
                              <p key={`${event.id}-${key}`} className="text-xs text-gray-600">
                                <span className="font-medium">{formatHistoryKey(key)}:</span>{' '}
                                {formatHistoryValue(key, values?.from, followUpLookups)} {'->'} {formatHistoryValue(key, values?.to, followUpLookups)}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-gray-400">No field-level changes captured.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityTab({ inquiry, historyLookups }) {
  const inquiryHistory = (Array.isArray(inquiry?.change_history) ? inquiry.change_history : []).map((event) => ({
    ...event,
    _scope: 'Inquiry',
    _scopeId: inquiry?.id,
  }));

  const followUpHistory = (Array.isArray(inquiry?.followUps) ? inquiry.followUps : []).flatMap((followUp) => {
    const events = Array.isArray(followUp?.change_history) ? followUp.change_history : [];
    return events.map((event) => ({
      ...event,
      _scope: 'Follow-up',
      _scopeId: followUp?.id,
      _followUp: followUp,
    }));
  });

  const activities = [...inquiryHistory, ...followUpHistory]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  return (
    <div className="space-y-3">
      {activities.map((act) => {
        const previousState = act?.old_values && typeof act.old_values === 'object' ? act.old_values : {};
        const nextState = act?.new_values && typeof act.new_values === 'object' ? act.new_values : {};
        const explicitChanges = nextState?.changed_fields && typeof nextState.changed_fields === 'object'
          ? nextState.changed_fields
          : null;
        const changedFields = explicitChanges && Object.keys(explicitChanges).length
          ? explicitChanges
          : deriveChangedFields(previousState, nextState);
        const changedEntries = Object.entries(changedFields);
        const cardKey = `${act._scope}-${act.id}`;

        const activityLookups = {
          ...historyLookups,
          staffById: {
            ...(historyLookups?.staffById || {}),
            ...(act?._followUp?.staff?.id ? { [String(act._followUp.staff.id)]: act._followUp.staff.name || `Staff #${act._followUp.staff.id}` } : {}),
          },
        };

        return (
          <div key={cardKey} className="bg-white rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-800">
                {act._scope} #{act._scopeId} - {actionLabel(act.action)}
              </p>
              <p className="text-xs text-gray-500">
                {act.user?.name ? `By ${act.user.name} | ` : ''}
                {formatDateTime(act.created_at)} ({relativeTime(act.created_at)})
              </p>
            </div>

            {changedEntries.length > 0 ? (
              <div className="mt-2 space-y-1">
                {changedEntries.map(([key, values]) => (
                  <p key={`${cardKey}-${key}`} className="text-xs text-gray-600">
                    <span className="font-medium">{formatHistoryKey(key)}:</span>{' '}
                    {formatHistoryValue(key, values?.from, activityLookups)} {'->'} {formatHistoryValue(key, values?.to, activityLookups)}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-400">No field-level details available.</p>
            )}
          </div>
        );
      })}
      {activities.length === 0 && <p className="text-center py-8 text-gray-400">No activity logged</p>}
    </div>
  );
}

function FollowUpModal({ isOpen, onClose, inquiryId, onSuccess }) {
  const [form, setForm] = useState({
    type: 'outgoing_call', duration_minutes: '', notes: '',
    interest_level: '', next_action: '', next_action_date: '',
  });
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = { ...form, inquiry_id: inquiryId };
      if (data.duration_minutes) data.duration_minutes = parseInt(data.duration_minutes);
      Object.keys(data).forEach(k => { if (data[k] === '') data[k] = null; });
      await api.post('/follow-ups', data);
      onSuccess();
      onClose();
      setForm({ type: 'outgoing_call', duration_minutes: '', notes: '', interest_level: '', next_action: '', next_action_date: '' });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log Follow-up" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
            <select name="type" value={form.type} onChange={handleChange} className={inputClass}>
              {FOLLOW_UP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
            <input name="duration_minutes" type="number" value={form.duration_minutes} onChange={handleChange} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} className={inputClass} placeholder="What was discussed..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Interest Level</label>
          <select name="interest_level" value={form.interest_level} onChange={handleChange} className={inputClass}>
            <option value="">Select</option>
            {INTEREST_LEVELS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Next Action</label>
            <input name="next_action" value={form.next_action} onChange={handleChange} className={inputClass} placeholder="e.g. Call back, Schedule visit" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Next Action Date</label>
            <input name="next_action_date" type="date" value={form.next_action_date} onChange={handleChange} className={inputClass} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {loading ? 'Saving...' : 'Save Follow-up'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StatusModal({ isOpen, onClose, inquiry, onSuccess }) {
  const [status, setStatus] = useState(inquiry?.status || '');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (inquiry) setStatus(inquiry.status);
  }, [inquiry]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.patch(`/inquiries/${inquiry.id}/status`, { status, notes: notes || undefined });
      onSuccess();
      onClose();
      setNotes('');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Update Status" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            {INQUIRY_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {loading ? 'Updating...' : 'Update Status'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
