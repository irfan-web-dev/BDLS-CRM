import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import Layout from './components/Layout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import InquiryList from './pages/inquiries/InquiryList';
import InquiryCreate from './pages/inquiries/InquiryCreate';
import InquiryDetail from './pages/inquiries/InquiryDetail';
import InquiryEdit from './pages/inquiries/InquiryEdit';

import Communications from './pages/Communications';
import Reports from './pages/Reports';

// Settings
import SettingsLayout from './pages/settings/SettingsLayout';
import CampusSettings from './pages/settings/CampusSettings';
import ClassSettings from './pages/settings/ClassSettings';
import StaffManagement from './pages/settings/StaffManagement';
import SourceSettings from './pages/settings/SourceSettings';
import TagSettings from './pages/settings/TagSettings';

function ComingSoon({ title }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
        <p className="text-gray-500">This section is coming in the next phase.</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />

            {/* Inquiries */}
            <Route path="/inquiries" element={<InquiryList />} />
            <Route path="/inquiries/new" element={<InquiryCreate />} />
            <Route path="/inquiries/:id" element={<InquiryDetail />} />
            <Route path="/inquiries/:id/edit" element={<InquiryEdit />} />

            {/* Placeholders for future phases */}
            <Route path="/students" element={<ComingSoon title="Students" />} />
            <Route path="/attendance" element={<ComingSoon title="Attendance" />} />
            <Route path="/homework" element={<ComingSoon title="Homework" />} />
            <Route path="/communications" element={<Communications />} />
            <Route path="/reports" element={<Reports />} />

            {/* Settings */}
            <Route path="/settings" element={
              <RoleRoute roles={['super_admin', 'admin']}>
                <SettingsLayout />
              </RoleRoute>
            }>
              <Route index element={<Navigate to="/settings/classes" replace />} />
              <Route path="campuses" element={<CampusSettings />} />
              <Route path="classes" element={<ClassSettings />} />
              <Route path="staff" element={<StaffManagement />} />
              <Route path="sources" element={<SourceSettings />} />
              <Route path="tags" element={<TagSettings />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
