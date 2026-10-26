import { useEffect, useMemo, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Scheduler } from 'calendarkit-pro';
import type { CalendarEvent, ViewType } from 'calendarkit-pro';
import EventDialog from './EventDialog';
import { makeSupabase } from '../lib/Supabase';

// Testing only: every event goes into one hard-coded calendar.
const TEST_CALENDAR_ID = 1;

// 'YYYY-MM-DD' -> local Date (new Date('YYYY-MM-DD') would parse as UTC and shift a day)
const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

// Date -> local 'YYYY-MM-DD' (toISOString would shift to UTC)
const toDateString = (d: Date | string) => {
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

// Shape of a row in the Supabase `event` table
type EventRow = {
  eventid: number;
  eventname: string;
  dateevent: string; // 'YYYY-MM-DD'
  calendarid: number;
  creationdate?: string;
};

const fromRow = (r: EventRow): CalendarEvent => {
  const day = parseDate(r.dateevent);
  return {
    id: String(r.eventid),
    title: r.eventname,
    start: day,
    end: endOfDay(day),
  } as CalendarEvent;
};

export default function Calendar() {
  const { getAccessTokenSilently } = useAuth0();
  const supabase = useMemo(
    () => makeSupabase(() => getAccessTokenSilently()),
    [getAccessTokenSilently]
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [view, setView] = useState<ViewType>('month');
  const [date, setDate] = useState(new Date());

  useEffect(() => {
    supabase.from('event').select('*')
      .eq('calendarid', TEST_CALENDAR_ID)
      .order('dateevent')
      .returns<EventRow[]>()
      .then(({ data, error }) => {
        if (error) return console.error(error);
        setEvents((data ?? []).map(fromRow));
      });
  }, [supabase]);

  async function createEvent(event: Partial<CalendarEvent>) {
    if (!event.title?.trim() || !event.start) return;
    const { data, error } = await supabase.from('event').insert({
      eventname: event.title.trim(),
      dateevent: toDateString(event.start),
      calendarid: TEST_CALENDAR_ID,
      creationdate: new Date().toISOString(),
      // userid omitted: it's an integer column and Auth0 IDs are text
    }).select().single<EventRow>();
    if (error) return console.error(error);
    setEvents(prev => [...prev, fromRow(data)]);
  }

  async function updateEvent(event: CalendarEvent) {
    setEvents(prev => prev.map(e => e.id === event.id ? event : e)); // optimistic
    const { error } = await supabase.from('event').update({
      eventname: event.title,
      dateevent: toDateString(event.start),
    }).eq('eventid', Number(event.id));
    if (error) console.error(error);
  }

  async function deleteEvent(id: string) {
    setEvents(prev => prev.filter(e => e.id !== id));
    const { error } = await supabase.from('event').delete().eq('eventid', Number(id));
    if (error) console.error(error);
  }

  const moveEvent = (e: CalendarEvent, start: Date, end: Date) =>
    updateEvent({ ...e, start, end });

  return (
    <div style={{ height: 700, textAlign: 'left' }}>
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