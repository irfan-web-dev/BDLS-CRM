import { NavLink, Outlet } from 'react-router-dom';
import { Building2, GraduationCap, Users, User, Tag, Megaphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/roleUtils';
import PageHeader from '../../components/ui/PageHeader';

const settingsNav = [
  { name: 'Campuses', href: '/settings/campuses', icon: Building2, superAdminOnly: true },
  { name: 'Classes', href: '/settings/classes', icon: GraduationCap },
  { name: 'Staff', href: '/settings/staff', icon: Users },
  { name: 'Students', href: '/settings/students', icon: User },
  { name: 'Inquiry Sources', href: '/settings/sources', icon: Megaphone },
  { name: 'Inquiry Tags', href: '/settings/tags', icon: Tag },
];

export default function SettingsLayout() {
  const { user } = useAuth();

  const visibleNav = settingsNav.filter(item =>
    !item.superAdminOnly || isSuperAdmin(user)
  );

  return (
    <div>
      <PageHeader title="Settings" subtitle="Manage system configuration" />

      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-56 shrink-0">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-2">
            {visibleNav.map(item => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
