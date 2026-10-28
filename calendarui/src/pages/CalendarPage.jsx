import { useAuth0 } from '@auth0/auth0-react';
import Calendar from '../components/calendar';
import '../index.css';
import './CalendarPage.css';

export default function CalendarPage() {
  const { logout } = useAuth0();

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
      <Calendar />
    </main>
  );
}
