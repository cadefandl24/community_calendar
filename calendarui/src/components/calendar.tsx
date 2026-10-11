import { Scheduler } from 'calendarkit-pro';
import type { CalendarEvent, ViewType } from 'calendarkit-pro';
import { useEffect, useState, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Sidebar from './sidebar';
import { useCalendarHub } from '../hooks/useCalendarHub';

type EventForm = {
    title: string;
    date: string;
    start: string;
    end: string;
    description: string;
};
type Props = {
    calendarId: string
};

type ApiEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
};

function toCalendarEvent(event: ApiEvent): CalendarEvent {
  return {
    id: event.id,
    title: event.title,
    start: new Date(event.startTime),
    end: new Date(event.endTime),
    description: event.description ?? '',
  };
}
export default function Calendar({ calendarId }: Props) {
    const { getAccessTokenSilently } = useAuth0();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [view, setView] = useState<ViewType>('month');
    const [date, setDate] = useState(new Date());
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [editingEvent] = useState<any>(null);
    // const [editingEvent, setEditingEvent] = useState<any>(null);
    const [form, setForm] = useState<EventForm>({
        title: '', date: '', start: '10:00', end: '11:00', description: ''
    });


    const fetchEvents = useCallback(async () => {
        const token = await getAccessTokenSilently();
        localStorage.setItem("token", token);
        const res = await fetch(`/api/calendar/events?calendarId=${calendarId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
            console.error(`Failed to fetch events: ${res.status} ${res.statusText}`);
            return;
        }
        const data = await res.json();
        setEvents(data.map(toCalendarEvent));
    }, [getAccessTokenSilently, calendarId]);

    useEffect(() => { fetchEvents(); }, [fetchEvents]);

    useCalendarHub(calendarId, getAccessTokenSilently, {
        onEventCreated: (e) => setEvents(prev => prev.some(x => x.id === e.id) ? prev : [...prev, toCalendarEvent(e)]),
        onEventUpdated: (e) => setEvents(prev => prev.map(x => x.id === e.id ? toCalendarEvent(e) : x)),
        onEventDeleted: (id) => setEvents(prev => prev.filter(x => x.id !== id)),
    });

    // function handleDateClick({ dateStr }: { dateStr: string }) {
    //     setEditingEvent(null);
    //     setForm({ title: '', date: dateStr, start: '10:00', end: '11:00', description: '' });
    //     setSidebarOpen(true);
    // }

    // function handleEventClick({ event }: { event: any }) {
    //     setEditingEvent(event);
    //     setForm({
    //         title: event.title,
    //         date: event.startStr.split('T')[0],
    //         start: event.startStr.split('T')[1]?.slice(0, 5) || '10:00',
    //         end: event.endStr.split('T')[1]?.slice(0, 5) || '11:00',
    //         description: event.extendedProps.description || ''
    //     });
    //     setSidebarOpen(true);
    // }

    async function handleSave() {

        const startTime = new Date(`${form.date}T${form.start}:00`);
        const endTime = new Date(`${form.date}T${form.end}:00`);

        if (endTime <= startTime) {
            alert('End time must be after start time');
            return;
        }
        const token = await getAccessTokenSilently();

        if (editingEvent) {
            await fetch(`/api/calendar/event/${editingEvent.id}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: form.title,
                    start: `${form.date}T${form.start}:00`,
                    end: `${form.date}T${form.end}:00`,
                    description: form.description,
                }),
            });
        } else {
            await fetch('/api/calendar/event', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    calendarId,
                    title: form.title,
                    start: `${form.date}T${form.start}:00`,
                    end: `${form.date}T${form.end}:00`,
                    description: form.description,
                }),
            });
        }

        setSidebarOpen(false);
        fetchEvents();
    }

    async function handleDelete() {
        if (!editingEvent) return;
        const token = await getAccessTokenSilently();
        await fetch(`/api/calendar/event/${editingEvent.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        setSidebarOpen(false);
        fetchEvents();
    }

    async function handleDuplicate(targetDate: string) {
        if (!editingEvent) return;

        const startTime = new Date(`${targetDate}T${form.start}:00`);
        const endTime = new Date(`${targetDate}T${form.end}:00`);

        if (endTime <= startTime) {
            alert('End time must be after start time');
            return;
        }

        const token = await getAccessTokenSilently();
        await fetch('/api/calendar/event', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                calendarId,
                title: `${form.title} (copy)`,
                start: `${targetDate}T${form.start}:00`,
                end: `${targetDate}T${form.end}:00`,
                description: form.description,
            }),
        });

        setSidebarOpen(false);
        fetchEvents();
    }


    return (
        <div style={{ position: 'relative' }}>
            <div>
            
                
                <div style={{ height: '700px', textAlign: 'left' }}>
                    <Scheduler
                        events={events}
                        view={view}
                        onViewChange={setView}
                        date={date}
                        onDateChange={setDate}
                        readOnly
                    />
                </div>
            </div>

            <Sidebar
                isOpen={sidebarOpen}
                editingEvent={editingEvent}
                form={form}
                setForm={setForm}
                onSave={handleSave}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onClose={() => setSidebarOpen(false)}
            />
        </div>
    );
}
