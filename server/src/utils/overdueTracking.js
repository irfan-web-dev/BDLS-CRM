const ACTIVE_INQUIRY_STATUSES = [
  'new',
  'contacted_attempt_1',
  'contacted_connected',
  'follow_up_scheduled',
  'visit_scheduled',
  'visit_completed',
  'form_issued',
  'form_submitted',
  'documents_pending',
];

function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split('T')[0];
}

function todayDateOnly(referenceDate = new Date()) {
  return referenceDate.toISOString().split('T')[0];
}

function isActiveInquiryStatus(status) {
  return ACTIVE_INQUIRY_STATUSES.includes(String(status || '').trim());
}

function isInquiryCurrentlyOverdue(inquiryLike, today = todayDateOnly()) {
  const status = inquiryLike?.status;
  const nextFollowUpDate = toDateOnly(inquiryLike?.next_follow_up_date);
  if (!isActiveInquiryStatus(status) || !nextFollowUpDate) return false;
  return nextFollowUpDate < today;
}

function applyOverdueTracking(inquiryLike, incomingUpdate = {}, now = new Date()) {
  const updateData = { ...incomingUpdate };
  const today = todayDateOnly(now);

  const hasNextFollowUpOverride = Object.prototype.hasOwnProperty.call(updateData, 'next_follow_up_date');
  const effectiveStatus = Object.prototype.hasOwnProperty.call(updateData, 'status')
    ? updateData.status
    : inquiryLike?.status;
  const effectiveNextFollowUpDate = hasNextFollowUpOverride
    ? updateData.next_follow_up_date
    : inquiryLike?.next_follow_up_date;

  const wasOverdueBefore = isInquiryCurrentlyOverdue(inquiryLike, today);
  const willBeOverdue = isInquiryCurrentlyOverdue({
    status: effectiveStatus,
    next_follow_up_date: effectiveNextFollowUpDate,
  }, today);
  const seenAsOverdue = wasOverdueBefore || willBeOverdue;

  const existingFirstOverdueDate = toDateOnly(updateData.first_overdue_date ?? inquiryLike?.first_overdue_date);
  const existingLastOverdueDate = toDateOnly(updateData.last_overdue_date ?? inquiryLike?.last_overdue_date);
  const overdueDateCandidate = toDateOnly(
    willBeOverdue ? effectiveNextFollowUpDate : inquiryLike?.next_follow_up_date
  );

  if (seenAsOverdue || updateData.was_ever_overdue || inquiryLike?.was_ever_overdue) {
    updateData.was_ever_overdue = true;
  }

  if (seenAsOverdue && overdueDateCandidate) {
    updateData.first_overdue_date = existingFirstOverdueDate || overdueDateCandidate;
    updateData.last_overdue_date = overdueDateCandidate;
  }

  if (wasOverdueBefore && !willBeOverdue) {
    const resolvedCountSeed = Number.parseInt(
      updateData.overdue_resolved_count ?? inquiryLike?.overdue_resolved_count,
      10
    ) || 0;
    updateData.overdue_resolved_count = resolvedCountSeed + 1;
    updateData.overdue_last_resolved_at = now;
    updateData.was_ever_overdue = true;

    const fallbackLastOverdueDate = toDateOnly(inquiryLike?.next_follow_up_date)
      || existingLastOverdueDate
      || overdueDateCandidate;
    if (fallbackLastOverdueDate) {
      updateData.last_overdue_date = updateData.last_overdue_date || fallbackLastOverdueDate;
      updateData.first_overdue_date = updateData.first_overdue_date
        || existingFirstOverdueDate
        || fallbackLastOverdueDate;
    }
  }

  return updateData;
}

export {
  ACTIVE_INQUIRY_STATUSES,
  applyOverdueTracking,
  isInquiryCurrentlyOverdue,
  todayDateOnly,
};
