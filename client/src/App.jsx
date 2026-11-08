import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import Report from './pages/Report';
import MyComplaints from './pages/MyComplaints';
import Track from './pages/Track';
import AdminDashboard from './pages/AdminDashboard';
import AdminTechnicians from './pages/AdminTechnicians';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="track" element={<Track />} />
        <Route path="track/:id" element={<Track />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        {/* Frontend guards are UX only; the API enforces roles on every request. */}
        <Route element={<ProtectedRoute />}>
          <Route path="report" element={<Report />} />
          <Route path="my-complaints" element={<MyComplaints />} />
        </Route>
        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="admin" element={<AdminDashboard />} />
          <Route path="admin/technicians" element={<AdminTechnicians />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
