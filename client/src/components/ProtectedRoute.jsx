import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './ui/LoadingSpinner';

const CRM_ALLOWED_ROLES = new Set(['super_admin', 'admin', 'staff']);

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner text="Checking authentication..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (!CRM_ALLOWED_ROLES.has(user.role)) return <Navigate to="/login" replace />;

  return children;
}
