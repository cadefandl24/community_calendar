import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { Scheduler } from 'calendarkit-pro';
import type { CalendarEvent, ViewType } from 'calendarkit-pro';
import EventDialog from './EventDialog';
import EventChat from './EventChat';
import UpcomingEvents from './UpcomingEvents';
import { useCalendarHub } from '../hooks/useCalendarHub';
import { API_URL } from '../lib/api';

// Shape of an event as the C# API sends it (see EventResponseDto.cs)
type EventDto = {
  id: string; calendarId: string; title: string; start: string; end: string;
  allDay: boolean; description?: string | null; createdBy: string; attendeeIds: string[];
  color?: string | null;
  recurrence?: {
    freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    interval?: number | null; count?: number | null; until?: string | null;
  } | null;
};

const fromDto = (e: EventDto): CalendarEvent => ({
  id: e.id, title: e.title, start: new Date(e.start), end: new Date(e.end),
  allDay: e.allDay, description: e.description ?? undefined,
  createdBy: e.createdBy, attendeeIds: e.attendeeIds,
  color: e.color ?? undefined,
  recurrence: e.recurrence ? {
    freq: e.recurrence.freq,
    interval: e.recurrence.interval ?? undefined,
    count: e.recurrence.count ?? undefined,
    until: e.recurrence.until ? new Date(e.recurrence.until) : undefined,
  } : undefined,
} as CalendarEvent);

// The calendar draws each repeat of a recurring event as a copy labeled
// "<event id>-<timestamp>". Event ids are 36 characters long, so the first
// 36 characters of any id are the id of the event saved in the database.
const seriesIdOf = (id: string | number | undefined) => String(id ?? '').slice(0, 36);

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

// Closes the calendar's event form straight away (used when a Viewer clicks an empty time slot)
function CloseImmediately({ onClose }: { onClose: () => void }) {
  useEffect(() => { onClose(); }, [onClose]);
  return null;
}

export default function Calendar({ calendarId, canEdit = false }: { calendarId: string; canEdit?: boolean }) {
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

  // Chat messages arriving over SignalR are passed on through this to whichever chat is open
  const [chatBus] = useState(() => new EventTarget());

  useCalendarHub(calendarId, () => getAccessTokenSilently(), {
    onEventCreated: e => upsert(fromDto(e as EventDto)),
    onEventUpdated: e => upsert(fromDto(e as EventDto)),
    onEventDeleted: id => setEvents(prev => prev.filter(x => x.id !== id)),
    onMessageCreated: m => chatBus.dispatchEvent(new CustomEvent('messageCreated', { detail: m })),
    onMessageDeleted: m => chatBus.dispatchEvent(new CustomEvent('messageDeleted', { detail: m })),
  });

  const body = (e: Partial<CalendarEvent>) => JSON.stringify({
    calendarId, title: e.title?.trim(), start: e.start, end: e.end,
    allDay: e.allDay ?? false, description: e.description ?? null,
    color: e.color ?? null,
    recurrence: e.recurrence ? {
      freq: e.recurrence.freq,
      interval: e.recurrence.interval ?? null,
      count: e.recurrence.count ?? null,
      until: e.recurrence.until ?? null,
    } : null,
  });

  async function createEvent(e: Partial<CalendarEvent>) {
    if (!canEdit || !e.title?.trim() || !e.start || !e.end) return;
    try {
      const saved: EventDto = await api('/event', { method: 'POST', body: body(e) });
      upsert(fromDto(saved));
    } catch (err) { console.error(err); }
  }

  async function updateEvent(changed: CalendarEvent) {
    if (!canEdit) return;   // Viewers can't move, resize or edit events
    const id = seriesIdOf(changed.id);
    let e = changed;

    if (String(changed.id) !== id) {
      // A repeated copy was edited or moved: apply the same change to the whole series.
      const series = events.find(x => x.id === id);
      if (!series) return;
      const copyStart = Number(String(changed.id).slice(id.length + 1));
      const shift = new Date(changed.start).getTime() - copyStart;
      const length = new Date(changed.end).getTime() - new Date(changed.start).getTime();
      const start = new Date(new Date(series.start).getTime() + shift);
      e = { ...changed, id, start, end: new Date(start.getTime() + length) };
    }

    upsert(e); // optimistic
    try {
      const saved: EventDto = await api(`/event/${id}`, { method: 'PUT', body: body(e) });
      upsert(fromDto(saved));
    } catch (err) { console.error(err); }
  }

  async function deleteEvent(id: string) {
    if (!canEdit) return;
    const seriesId = seriesIdOf(id);   // deleting any repeat deletes the whole series
    setEvents(prev => prev.filter(x => x.id !== seriesId));
    await api(`/event/${seriesId}`, { method: 'DELETE' }).catch(console.error);
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
            const event = events.find(item => item.id === seriesIdOf(props.event?.id));
            // Viewers can't create events, so an empty-slot click closes the form again
            if (!event && !canEdit) return <CloseImmediately onClose={props.onClose} />;
            const attendeeIds: string[] = event?.attendeeIds ?? [];
            return (
              <EventDialog
                {...props}
                attendance={event && userId ? {
                  going: attendeeIds.includes(userId),
                  pending: attendancePending,
                  onChange: going => changeAttendance(event.id, going),
                } : undefined}
                canEdit={canEdit}
                chat={event ? (
                  <EventChat key={event.id} eventId={String(event.id)} userId={userId} api={api} bus={chatBus} />
                ) : undefined}
              />
            );
          }}
        />
        {sidebarContent && createPortal(<UpcomingEvents events={events} status={eventStatus} />, sidebarContent)}
      </div>
    </div>
  );
}