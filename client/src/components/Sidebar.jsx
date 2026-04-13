import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, UserSearch, GraduationCap, ClipboardCheck,
  BookOpen, MessageSquare, BarChart3, Settings, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isAdminOrAbove } from '../utils/roleUtils';
import { getPortalTitle } from '../utils/portalBranding';

const primaryNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Inquiries', href: '/inquiries', icon: UserSearch },
  { name: 'Manual Entry', href: '/inquiries/manual-entry', icon: UserSearch },
  { name: 'Attendance', href: '/attendance', icon: ClipboardCheck },
  { name: 'Homework', href: '/homework', icon: BookOpen },
  { name: 'Communications', href: '/communications', icon: MessageSquare },
];

const adminNavigation = [
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const portalTitle = getPortalTitle(user);
  const navigation = isAdminOrAbove(user)
    ? [
      primaryNavigation[0],
      primaryNavigation[1],
      { name: 'Students', href: '/students', icon: GraduationCap },
      ...primaryNavigation.slice(2),
    ]
    : primaryNavigation;

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary-50 text-primary-700'
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
    }`;

  const content = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary-600 flex items-center justify-center">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">{portalTitle}</span>
        </div>
        <button onClick={onClose} className="lg:hidden rounded-lg p-1 hover:bg-gray-100">
          <X className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {navigation.map(item => (
            <NavLink key={item.name} to={item.href} className={linkClass} onClick={onClose}>
              <item.icon className="h-5 w-5" />
              {item.name}
            </NavLink>
          ))}
        </div>

        {isAdminOrAbove(user) && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Admin</p>
            <div className="space-y-1">
              {adminNavigation.map(item => (
                <NavLink key={item.name} to={item.href} className={linkClass} onClick={onClose}>
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* User info */}
      <div className="border-t border-gray-100 px-4 py-3">
        <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
        <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
        {user?.campus && (
          <p className="text-xs text-gray-400 truncate">{user.campus.name}</p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      {/* Mobile sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-xl transform transition-transform lg:hidden ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {content}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
          {content}
        </div>
      </div>
    </>
  );
}
