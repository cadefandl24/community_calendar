import './App.css';
import CalendarPage from './pages/CalendarPage';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<CalendarPage />} />
      </Routes>
    </Router>
  );
}
