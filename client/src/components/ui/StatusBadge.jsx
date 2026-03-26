import { INQUIRY_STATUSES, PRIORITIES } from '../../utils/constants';
import Badge from './Badge';

export function InquiryStatusBadge({ status }) {
  const found = INQUIRY_STATUSES.find(s => s.value === status);
  if (!found) return <Badge>{status}</Badge>;
  return <Badge color={found.color}>{found.label}</Badge>;
}

export function PriorityBadge({ priority }) {
  const found = PRIORITIES.find(p => p.value === priority);
  if (!found) return <Badge>{priority}</Badge>;
  return <Badge color={found.color}>{found.label}</Badge>;
}
