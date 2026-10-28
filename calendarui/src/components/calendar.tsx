import { apiFetch } from '../lib/api';
import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Scheduler } from 'calendarkit-pro';
import type { CalendarEvent, ViewType } from 'calendarkit-pro';
import EventDialog from './EventDialog';

type EventResponse = {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
};

const fromResponse = (event: EventResponse): CalendarEvent => ({
  ...event, start: new Date(event.start), end: new Date(event.end),
});

export default function Calendar() {
  const { getAccessTokenSilently, isAuthenticated, isLoading, loginWithRedirect, user } = useAuth0();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendar, setCalendar] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<ViewType>('month');
  const [date, setDate] = useState(new Date());

  async function request(path: string, options: RequestInit = {}) {
    const token = await getAccessTokenSilently();
    const response = await apiFetch(path, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(`Calendar request failed (${response.status}). Please try again.`);
    return response.json();
  }

  useEffect(() => {
    let cancelled = false;
    setCalendar(null);
    setEvents([]);
    if (!isAuthenticated) return;
    setLoading(true);
    setError('');
    async function load() {
      try {
        const token = await getAccessTokenSilently();
        const headers = { Authorization: `Bearer ${token}` };
        const calendarResponse = await apiFetch('/api/calendars/personal', { headers });
        if (!calendarResponse.ok) throw new Error('Could not load your personal calendar. Please try again.');
        const personal = await calendarResponse.json();
        const eventsResponse = await apiFetch(`/api/calendar/events?calendarId=${encodeURIComponent(personal.id)}`, { headers });
        if (!eventsResponse.ok) throw new Error('Could not load your events. Please try again.');
        const data: EventResponse[] = await eventsResponse.json();
        if (!cancelled) {
          setCalendar(personal);
          setEvents(data.map(fromResponse));
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load your calendar.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [getAccessTokenSilently, isAuthenticated, user?.sub, retry]);

  async function createEvent(event: Partial<CalendarEvent>) {
    if (!calendar || !event.title?.trim() || !event.start || !event.end) return;
    try {
      const saved = await request('/api/calendar/event', {
        method: 'POST',
        body: JSON.stringify({ ...event, calendarId: calendar.id, title: event.title.trim() }),
      });
      setEvents(previous => [...previous, fromResponse(saved)]);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your event.');
    }
  }

  async function updateEvent(event: CalendarEvent) {
    try {
      const saved = await request(`/api/calendar/event/${encodeURIComponent(event.id)}`, {
        method: 'PUT', body: JSON.stringify(event),
      });
      setEvents(previous => previous.map(item => item.id === event.id ? fromResponse(saved) : item));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your event.');
    }
  }

  async function deleteEvent(id: string) {
    try {
      await request(`/api/calendar/event/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setEvents(previous => previous.filter(event => event.id !== id));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete your event.');
    }
  }

  const moveEvent = (e: CalendarEvent, start: Date, end: Date) =>
    updateEvent({ ...e, start, end });

  if (isLoading) return <p role="status">Loading…</p>;
  if (!isAuthenticated) return <button type="button" onClick={() => loginWithRedirect()}>Log in to see your calendar</button>;
  if (loading) return <p role="status">Loading your calendar…</p>;
  if (!calendar) return <div><p role="alert">{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div>;

  return (
    <div style={{ height: 700, textAlign: 'left' }}>
      <h2>{calendar.name}</h2>
      {error && <p role="alert">{error}</p>}
      <Scheduler
        events={events} view={view} onViewChange={setView}
        date={date} onDateChange={setDate}
        onEventCreate={createEvent} onEventUpdate={updateEvent}
        onEventDelete={deleteEvent} onEventDrop={moveEvent} onEventResize={moveEvent}
        renderEventForm={({ isOpen, ...props }) => isOpen ? <EventDialog {...props} /> : null}
      />
    </div>
  );
}