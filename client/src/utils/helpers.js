export function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(date) {
  if (!date) return '-';
  return new Date(date).toLocaleString('en-PK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(date) {
  if (!date) return '';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function getStatusColor(color) {
  const colors = {
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
    gray: 'bg-gray-100 text-gray-700',
  };
  return colors[color] || colors.gray;
}

export function getStatusDotColor(color) {
  const colors = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    gray: 'bg-gray-400',
  };
  return colors[color] || colors.gray;
}

export function formatPhone(phone) {
  if (!phone) return '-';
  return phone;
}

export function isOverdue(date) {
  if (!date) return false;
  const today = new Date().toISOString().split('T')[0];
  return date < today;
}

export function isToday(date) {
  if (!date) return false;
  const today = new Date().toISOString().split('T')[0];
  return date === today;
}
