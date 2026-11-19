import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import AccountDropdown from '../components/AccountDropdown';
import Calendar from '../components/calendar';
import CalendarPicker from '../components/calendarPicker';
import { API_URL } from '../lib/api';
import '../index.css';
import './CalendarPage.css';

// initialCalendarId: the calendar picked on the landing page
// onHome: goes back to the landing page
export default function CalendarPage({ initialCalendarId = null, onHome }) {
  const { logout, user, getAccessTokenSilently } = useAuth0();
  const [hasCalendars, setHasCalendars] = useState(null);   // null = still checking
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarId, setCalendarId] = useState(initialCalendarId);
  const [role, setRole] = useState(null);   // my role in the selected calendar
  const [pickerKey, setPickerKey] = useState(0);
  const [removedNotice, setRemovedNotice] = useState('');

  // The Owner removed me from the calendar I'm viewing: close it and reload my calendar list
  function handleRemoved() {
    setCalendarId(null);
    setRole(null);
    setPickerKey(key => key + 1);
    setRemovedNotice('You were removed from that calendar.');
  }

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

  // Each time a calendar is opened: keep the address bar on it (so Refresh stays here)
  // and tell the API, so it counts as recently used on the landing page
  useEffect(() => {
    if (!calendarId) return;
    window.history.replaceState(null, '', `/?calendar=${encodeURIComponent(calendarId)}`);

    async function markOpened() {
      try {
        const token = await getAccessTokenSilently();
        await fetch(`${API_URL}/api/calendars/${calendarId}/opened`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Not important enough to show an error; the calendar still works
      }
    }

    markOpened();
  }, [calendarId, getAccessTokenSilently]);

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
      <h1 className="calendar-page-title">
        <a
          href="/"
          onClick={event => {
            if (!onHome) return;
            event.preventDefault();
            onHome();
          }}
        >
          <img className="calendar-page-logo" src="https://i.postimg.cc/1tbn8tT4/New-Calendar-Logo.png" alt="" />
          <span>Community Calendar</span>
        </a>
      </h1>

      {hasCalendars === null ? (
        <p>Loading your calendars…</p>
      ) : showPicker ? (
        <>
          <p className="removed-notice" role="status">{removedNotice}</p>
          <CalendarPicker
            key={pickerKey}
            selectedId={calendarId}
            onSelect={id => { setCalendarId(id); if (id) setRemovedNotice(''); }}
            onRoleChange={setRole}
          />
          {calendarId && <Calendar key={calendarId} calendarId={calendarId} role={role} onRemoved={handleRemoved} />}
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