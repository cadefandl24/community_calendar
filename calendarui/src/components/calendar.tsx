import { useState } from 'react';
import { Scheduler } from 'calendarkit-pro';
import type { CalendarEvent, ViewType } from 'calendarkit-pro';
import EventDialog from './EventDialog';

export default function Calendar() {
    // Events stay in memory until the page reloads. API persistence can be added here later.
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [view, setView] = useState<ViewType>('month');
    const [date, setDate] = useState(new Date());

    function createEvent(event: Partial<CalendarEvent>) {
        if (!event.title?.trim() || !event.start || !event.end) return;

        const newEvent: CalendarEvent = {
            ...event,
            id: crypto.randomUUID(),
            title: event.title.trim(),
            start: event.start,
            end: event.end,
        };
        setEvents(previous => [...previous, newEvent]);
    }

    function updateEvent(event: CalendarEvent) {
        setEvents(previous => previous.map(existing =>
            existing.id === event.id ? event : existing
        ));
    }

    function deleteEvent(id: string) {
        setEvents(previous => previous.filter(event => event.id !== id));
    }

    function moveEvent(event: CalendarEvent, start: Date, end: Date) {
        updateEvent({ ...event, start, end });
    }

    return (
        <div style={{ height: '700px', textAlign: 'left' }}>
            <Scheduler
                events={events}
                view={view}
                onViewChange={setView}
                date={date}
                onDateChange={setDate}
                onEventCreate={createEvent}
                onEventUpdate={updateEvent}
                onEventDelete={deleteEvent}
                onEventDrop={moveEvent}
                onEventResize={moveEvent}
                renderEventForm={({ isOpen, ...props }) => isOpen ? <EventDialog {...props} /> : null}
            />
        </div>
    );
}
