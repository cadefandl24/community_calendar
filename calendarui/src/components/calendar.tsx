import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { Scheduler } from 'calendarkit-pro';
import type { CalendarEvent, ViewType } from 'calendarkit-pro';
import EventDialog from './EventDialog';
import UpcomingEvents from './UpcomingEvents';
import { useCalendarHub } from '../hooks/useCalendarHub';
import { API_URL } from '../lib/api';

// Shape of an event as the C# API sends it (see EventResponseDto.cs)
type EventDto = {
  id: string; calendarId: string; title: string; start: string; end: string;
  allDay: boolean; description?: string | null; createdBy: string; attendeeIds: string[];
};

const fromDto = (e: EventDto): CalendarEvent => ({
  id: e.id, title: e.title, start: new Date(e.start), end: new Date(e.end),
  allDay: e.allDay, description: e.description ?? undefined,
  createdBy: e.createdBy, attendeeIds: e.attendeeIds,
} as CalendarEvent);

const localTimeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
});

function LocalTime() {
  const [time, setTime] = useState(() => localTimeFormat.format(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => setTime(localTimeFormat.format(new Date())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <p className="community-scheduler-time">
      <span>Local time</span>
      <span>{time}</span>
    </p>
  );
}

export default function Calendar({ calendarId }: { calendarId: string }) {
  const { getAccessTokenSilently, user } = useAuth0();
  const userId = user?.sub;
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [attendancePending, setAttendancePending] = useState(false);
  const [eventStatus, setEventStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sidebarContent, setSidebarContent] = useState<Element | null>(null);
  const [view, setView] = useState<ViewType>('month');
  const [date, setDate] = useState(new Date());

  const findSidebarContent = useCallback((element: HTMLDivElement | null) => {
    // CalendarKit has no sidebar content slot. Mount below its mini calendar.
    setSidebarContent(element?.querySelector('.space-y-5:has(> .rounded-2xl input[data-cal-id])') ?? null);
  }, []);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getAccessTokenSilently();
    const res = await fetch(`${API_URL}/api/calendar${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
  }, [getAccessTokenSilently]);

  useEffect(() => {
    const controller = new AbortController();
    api(`/events?calendarId=${encodeURIComponent(calendarId)}`, { signal: controller.signal })
      .then((data: EventDto[]) => {
        if (controller.signal.aborted) return;
        setEvents(data.map(fromDto));
        setEventStatus('ready');
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setEventStatus('error');
        console.error(error);
      });
    return () => controller.abort();
  }, [api, calendarId]);

  const upsert = (e: CalendarEvent) =>
    setEvents(prev => prev.some(x => x.id === e.id)
      ? prev.map(x => (x.id === e.id ? e : x))
      : [...prev, e]);

  useCalendarHub(calendarId, () => getAccessTokenSilently(), {
    onEventCreated: e => upsert(fromDto(e)),
    onEventUpdated: e => upsert(fromDto(e)),
    onEventDeleted: id => setEvents(prev => prev.filter(x => x.id !== id)),
  });

  const body = (e: Partial<CalendarEvent>) => JSON.stringify({
    calendarId, title: e.title?.trim(), start: e.start, end: e.end,
    allDay: e.allDay ?? false, description: e.description ?? null,
  });

  async function createEvent(e: Partial<CalendarEvent>) {
    if (!e.title?.trim() || !e.start || !e.end) return;
    try {
      const saved: EventDto = await api('/event', { method: 'POST', body: body(e) });
      upsert(fromDto(saved));
    } catch (err) { console.error(err); }
  }

  async function updateEvent(e: CalendarEvent) {
    upsert(e); // optimistic
    try {
      const saved: EventDto = await api(`/event/${e.id}`, { method: 'PUT', body: body(e) });
      upsert(fromDto(saved));
    } catch (err) { console.error(err); }
  }

  async function deleteEvent(id: string) {
    setEvents(prev => prev.filter(x => x.id !== id));
    await api(`/event/${id}`, { method: 'DELETE' }).catch(console.error);
  }

  async function changeAttendance(eventId: string, going: boolean) {
    if (attendancePending || !userId) return;

    setAttendancePending(true);
    try {
      const updated: EventDto = await api(`/event/${eventId}/attend`, {
        method: going ? 'POST' : 'DELETE',
      });
      setEvents(current => current.map(event => event.id === updated.id
        ? { ...event, attendeeIds: updated.attendeeIds }
        : event));
    } finally {
      setAttendancePending(false);
    }
  }

  const moveEvent = (e: CalendarEvent, start: Date, end: Date) =>
    updateEvent({ ...e, start, end });

  return (
    <div className="community-scheduler" style={{ textAlign: 'left' }}>
      <LocalTime />
      <div ref={findSidebarContent} style={{ height: 700 }}>
        <Scheduler
          events={events} view={view} onViewChange={setView}
          date={date} onDateChange={setDate}
          onEventCreate={createEvent} onEventUpdate={updateEvent}
          onEventDelete={deleteEvent} onEventDrop={moveEvent} onEventResize={moveEvent}
          renderEventForm={({ isOpen, ...props }) => {
            if (!isOpen) return null;
            const event = events.find(item => item.id === props.event?.id);
            const attendeeIds: string[] = event?.attendeeIds ?? [];
            return (
              <EventDialog
                {...props}
                attendance={event && userId ? {
                  going: attendeeIds.includes(userId),
                  pending: attendancePending,
                  onChange: going => changeAttendance(event.id, going),
                } : undefined}
              />
            );
          }}
        />
        {sidebarContent && createPortal(<UpcomingEvents events={events} status={eventStatus} />, sidebarContent)}
      </div>
    </div>
  );
}
