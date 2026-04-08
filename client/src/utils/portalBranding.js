export function getPortalType(user) {
  if (!user) return 'crm';
  if (user.role === 'super_admin') return 'crm';

  const campusType = user?.campus?.campus_type || user?.campus_type;
  return campusType === 'college' ? 'college' : 'school';
}

export function getPortalTitle(user) {
  const portalType = getPortalType(user);
  if (portalType === 'college') return 'College CRM';
  if (portalType === 'school') return 'School CRM';
  return 'CRM';
}
