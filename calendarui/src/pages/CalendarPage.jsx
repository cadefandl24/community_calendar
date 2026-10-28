import { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Calendar from '../components/calendar';
import '../index.css';
import './CalendarPage.css';

export default function CalendarPage() {
  const { logout } = useAuth0();
  const [showCalendar, setShowCalendar] = useState(false);

  return (
    <main>
      <div className="calendar-page-actions">
        <button
          className="logout-button"
          type="button"
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
        >
          Log out
        </button>
      </div>
      <h1>Community Calendar</h1>
      {showCalendar ? (
        <Calendar />
      ) : (
        <>
          <h2>Bring Everyone Together</h2>
          <h3>Create Your First Calendar Below</h3>
          <button className="create-calendar-button" type="button" onClick={() => setShowCalendar(true)}>
            Create Calendar
          </button>
        </>
      )}
    </main>
  );
}
