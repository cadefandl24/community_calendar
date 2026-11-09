import './App.css';
import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import CalendarPage from './pages/CalendarPage';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';

// Starts a fresh login, or goes home if already logged in.
function LoginRoute() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) loginWithRedirect();
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  if (!isLoading && isAuthenticated) return <Navigate to="/" replace />;
  return null;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<CalendarPage />} />
        <Route path="/login" element={<LoginRoute />} />
      </Routes>
    </Router>
  );
}