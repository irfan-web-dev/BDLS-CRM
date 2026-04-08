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
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import { InquiryStatusBadge, PriorityBadge } from '../../components/ui/StatusBadge';

export default function InquiryDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [inquiry, setInquiry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [followUpModal, setFollowUpModal] = useState(false);
  const [statusModal, setStatusModal] = useState(false);

  useEffect(() => { loadInquiry(); }, [id]);

  async function loadInquiry() {
    try {
      const res = await api.get(`/inquiries/${id}`);
      setInquiry(res.data);
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
      {activeTab === 'overview' && <OverviewTab inquiry={inquiry} />}
      {activeTab === 'followUps' && <FollowUpsTab followUps={inquiry.followUps || []} />}
      {activeTab === 'activity' && <ActivityTab inquiryId={inquiry.id} />}

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

function OverviewTab({ inquiry }) {
  const isCollegeInquiry = inquiry?.campus?.campus_type === 'college';

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
          {inquiry.session_preference && <InfoRow label="Session" value={inquiry.session_preference} />}
          <InfoRow label="Assigned To" value={inquiry.assignedStaff?.name || 'Unassigned'} />
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
          <p>Created by {inquiry.createdBy?.name} on {formatDateTime(inquiry.created_at)}</p>
          {inquiry.updatedBy && <p>Last updated by {inquiry.updatedBy.name} on {formatDateTime(inquiry.updated_at)}</p>}
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

function FollowUpsTab({ followUps }) {
  if (followUps.length === 0) {
    return <p className="text-center py-8 text-gray-400">No follow-ups recorded yet</p>;
  }

  return (
    <div className="space-y-4">
      {followUps.sort((a, b) => new Date(b.follow_up_date) - new Date(a.follow_up_date)).map(fu => {
        const typeLabel = FOLLOW_UP_TYPES.find(t => t.value === fu.type)?.label || fu.type;
        const interestLabel = INTEREST_LEVELS.find(i => i.value === fu.interest_level);
        return (
          <div key={fu.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge color="blue">{typeLabel}</Badge>
                {fu.duration_minutes && <span className="text-xs text-gray-400">{fu.duration_minutes} min</span>}
              </div>
              <span className="text-xs text-gray-400">{formatDateTime(fu.follow_up_date)}</span>
            </div>
            {fu.notes && <p className="text-sm text-gray-700 mb-2">{fu.notes}</p>}
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>By: {fu.staff?.name}</span>
              {interestLabel && <Badge color={interestLabel.color}>{interestLabel.label}</Badge>}
              {fu.next_action && <span>Next: {fu.next_action}</span>}
              {fu.next_action_date && (
                <span className={isOverdue(fu.next_action_date) ? 'text-red-600 font-medium' : ''}>
                  Due: {formatDate(fu.next_action_date)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActivityTab({ inquiryId }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/recent-activity')
      .then(res => {
        const filtered = res.data.filter(a => a.entity_type === 'inquiry' && a.entity_id === parseInt(inquiryId));
        setActivities(filtered);
      })
      .finally(() => setLoading(false));
  }, [inquiryId]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-3">
      {activities.map(act => (
        <div key={act.id} className="flex items-start gap-3 bg-white rounded-lg border p-3">
          <div className="mt-1 h-2 w-2 rounded-full bg-primary-400 shrink-0" />
          <div>
            <span className="text-sm font-medium">{act.user?.name}</span>
            <span className="text-sm text-gray-500"> {act.action.replace(/\./g, ' ')}</span>
            <p className="text-xs text-gray-400">{relativeTime(act.created_at)}</p>
          </div>
        </div>
      ))}
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
