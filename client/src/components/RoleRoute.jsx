import { useAuth } from '../context/AuthContext';

export default function RoleRoute({ roles, children }) {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-500">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return children;
}
