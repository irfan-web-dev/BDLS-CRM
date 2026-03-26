export const isSuperAdmin = (user) => user?.role === 'super_admin';
export const isAdmin = (user) => user?.role === 'admin';
export const isStaff = (user) => user?.role === 'staff';
export const isAdminOrAbove = (user) => ['super_admin', 'admin'].includes(user?.role);
