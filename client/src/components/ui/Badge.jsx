import { getStatusColor } from '../../utils/helpers';

export default function Badge({ children, color = 'gray', className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(color)} ${className}`}>
      {children}
    </span>
  );
}
