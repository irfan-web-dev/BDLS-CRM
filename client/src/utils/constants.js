export const INQUIRY_STATUSES = [
  { value: 'new', label: 'New Inquiry', color: 'blue', step: 1 },
  { value: 'contacted_attempt_1', label: 'Contact Attempt 1', color: 'blue', step: 2 },
  { value: 'contacted_connected', label: 'Connected', color: 'blue', step: 3 },
  { value: 'follow_up_scheduled', label: 'Follow-up Scheduled', color: 'yellow', step: 4 },
  { value: 'visit_scheduled', label: 'Visit Scheduled', color: 'yellow', step: 5 },
  { value: 'visit_completed', label: 'Visit Completed', color: 'yellow', step: 6 },
  { value: 'form_issued', label: 'Form Issued', color: 'yellow', step: 7 },
  { value: 'form_submitted', label: 'Form Submitted', color: 'yellow', step: 8 },
  { value: 'documents_pending', label: 'Documents Pending', color: 'yellow', step: 9 },
  { value: 'admitted', label: 'Admitted', color: 'green', step: 10 },
  { value: 'deferred', label: 'Deferred', color: 'gray', step: 11 },
  { value: 'not_interested', label: 'Not Interested', color: 'red', step: 12 },
  { value: 'no_response', label: 'No Response', color: 'red', step: 13 },
  { value: 'lost', label: 'Lost', color: 'red', step: 14 },
];

export const PRIORITIES = [
  { value: 'normal', label: 'Normal', color: 'gray' },
  { value: 'high', label: 'High', color: 'yellow' },
  { value: 'urgent', label: 'Urgent', color: 'red' },
];

export const QUOTA_TYPES = [
  { value: 'private', label: 'Private' },
  { value: 'pwwf', label: 'PWWF' },
];

export const INTEREST_LEVELS = [
  { value: 'very_interested', label: 'Very Interested', color: 'green' },
  { value: 'interested', label: 'Interested', color: 'blue' },
  { value: 'not_sure', label: 'Not Sure', color: 'yellow' },
  { value: 'not_interested', label: 'Not Interested', color: 'red' },
];

export const FOLLOW_UP_TYPES = [
  { value: 'outgoing_call', label: 'Outgoing Call' },
  { value: 'incoming_call', label: 'Incoming Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'in_person', label: 'In Person' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Other' },
];

export const RELATIONSHIPS = [
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'other', label: 'Other' },
];

export const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export const SESSION_PREFERENCES = [
  { value: 'Morning', label: 'Morning' },
  { value: 'Afternoon', label: 'Afternoon' },
  { value: 'Evening', label: 'Evening' },
];

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  STAFF: 'staff',
};

export const LAHORE_AREAS = [
  'Allama Iqbal Town', 'Askari', 'Bahria Town', 'Cantt',
  'DHA Phase 1', 'DHA Phase 2', 'DHA Phase 3', 'DHA Phase 4',
  'DHA Phase 5', 'DHA Phase 6', 'DHA Phase 7', 'DHA Phase 8',
  'Faisal Town', 'Garden Town', 'Gulberg', 'Gulshan-e-Ravi',
  'Iqbal Town', 'Johar Town', 'Jubilee Town', 'Lake City',
  'Lahore Cantt', 'Model Town', 'Mughalpura', 'Muslim Town',
  'Nishtar Colony', 'PCSIR Housing Society', 'Punjab Coop Housing Society',
  'Raiwind Road', 'Sabzazar', 'Samanabad', 'Shalimar',
  'Shahdara', 'Township', 'Wahdat Road', 'Wapda Town',
  'Valencia Town', 'EME Society', 'Cavalry Ground',
  'Bedian Road', 'Barki Road', 'Ferozpur Road',
  'GT Road', 'Jail Road', 'Mall Road', 'Multan Road',
  'Thokar Niaz Baig', 'Sheikhupura Road', 'Walton Road',
].sort();
