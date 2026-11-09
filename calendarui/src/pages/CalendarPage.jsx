import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import AccountDropdown from '../components/AccountDropdown';
import Calendar from '../components/calendar';
import CalendarPicker from '../components/calendarPicker';
import { API_URL } from '../lib/api';
import '../index.css';
import './CalendarPage.css';

export default function CalendarPage() {
  const { logout, user, getAccessTokenSilently } = useAuth0();
  const [hasCalendars, setHasCalendars] = useState(null);   // null = still checking
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarId, setCalendarId] = useState(null);

  // Ask the API once whether this user already has any calendars
  useEffect(() => {
    let cancelled = false;

    async function checkCalendars() {
      try {
        const token = await getAccessTokenSilently();
        const response = await fetch(`${API_URL}/api/calendars`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Could not load calendars');
        const data = await response.json();
        if (!cancelled) setHasCalendars(data.length > 0);
      } catch {
        // If the check fails, show the picker; it displays its own error message
        if (!cancelled) setHasCalendars(true);
      }
    }

    checkCalendars();
    return () => { cancelled = true; };
  }, [getAccessTokenSilently]);

  const showPicker = showCalendar || hasCalendars === true;

  return (
    <main>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <AccountDropdown key={user?.sub} user={user} />
        <button
          className="logout-button shrink-0"
          type="button"
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
        >
          Log out
        </button>
      </div>
      <h1>Community Calendar</h1>

      {hasCalendars === null ? (
        <p>Loading your calendars…</p>
      ) : showPicker ? (
        <>
          <CalendarPicker selectedId={calendarId} onSelect={setCalendarId} />
          {calendarId && <Calendar key={calendarId} calendarId={calendarId} />}
        </>
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