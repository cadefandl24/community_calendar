import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CalendarEvent, CalendarProps } from 'calendarkit-pro';
import './EventDialog.css';

type Props = Omit<Parameters<NonNullable<CalendarProps['renderEventForm']>>[0], 'isOpen'> & {
    attendance?: {
        going: boolean;
        pending: boolean;
        onChange: (going: boolean) => Promise<void>;
    };
};

// Colors people can pick for an event. Each is dark enough to read as text
// on the light tint the calendar draws behind it.
const EVENT_COLORS = [
    { name: 'Blue', value: '#2563eb' },
    { name: 'Teal', value: '#0f766e' },
    { name: 'Green', value: '#15803d' },
    { name: 'Orange', value: '#c2410c' },
    { name: 'Red', value: '#dc2626' },
    { name: 'Pink', value: '#be185d' },
    { name: 'Purple', value: '#7c3aed' },
    { name: 'Gray', value: '#4b5563' },
];

// datetime-local expects local wall time rather than a UTC ISO string.
function localDateTime(date: Date) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function EventDialog({ event, initialDate, onSave, onDelete, onClose, attendance }: Props) {
    const dialog = useRef<HTMLDialogElement>(null);
    const headingId = useId();
    const [title, setTitle] = useState(event?.title ?? '');
    const [start, setStart] = useState(() => localDateTime(event?.start ?? initialDate ?? new Date()));
    const [end, setEnd] = useState(() => localDateTime(event?.end ?? new Date((initialDate ?? new Date()).getTime() + 3600000)));
    const [description, setDescription] = useState(event?.description ?? '');
    const [location, setLocation] = useState<string>(typeof event?.location === 'string' ? event.location : '');
    const [guests, setGuests] = useState(event?.guests?.join(', ') ?? '');
    const [recurrence, setRecurrence] = useState(event?.recurrence?.freq ?? '');
    const [reminder, setReminder] = useState(event?.reminders?.[0]?.time.toString() ?? '30');
    const [color, setColor] = useState(event?.color ?? '');
    const [error, setError] = useState('');
    const [attendanceError, setAttendanceError] = useState('');

    useEffect(() => {
        const element = dialog.current;
        element?.showModal();
        return () => element?.close();
    }, []);

    async function toggleAttendance() {
        if (!attendance || attendance.pending) return;
        setAttendanceError('');
        try {
            await attendance.onChange(!attendance.going);
        } catch {
            setAttendanceError(attendance.going
                ? 'Could not leave the event. Try again.'
                : 'Could not join the event. Try again.');
        }
    }

    function save(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!title.trim()) return setError('Give your event a title.');
        const startDate = new Date(start);
        const endDate = new Date(end);
        if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
            return setError('Choose an end date and time after the start.');
        }
        const next: Partial<CalendarEvent> = {
            ...event, title: title.trim(), start: startDate, end: endDate,
            description, location,
            guests: guests.split(',').map(guest => guest.trim()).filter(Boolean),
            recurrence: recurrence ? { ...event?.recurrence, freq: recurrence as NonNullable<CalendarEvent['recurrence']>['freq'] } : undefined,
            color: color || undefined,
            reminders: reminder ? [{ id: event?.reminders?.[0]?.id ?? crypto.randomUUID(), type: 'notification', time: Number(reminder), label: `${reminder} minutes before` }] : [],
        };
        onSave(next);
        onClose();
    }

    return (
        <dialog ref={dialog} className="event-dialog" aria-labelledby={headingId} onCancel={onClose}>
            <form className="event-dialog-form" onSubmit={save}>
                <header className="event-dialog-header">
                    <div><p className="event-dialog-eyebrow">COMMUNITY CALENDAR</p><h2 id={headingId}>{event ? 'Edit event' : 'Create your event'}</h2><p>{event ? 'Update the details for your event.' : 'Enter details below.'}</p></div>
                    <button className="event-dialog-close" type="button" aria-label="Close event form" onClick={onClose}>×</button>
                </header>
                <div className="event-dialog-body">
                    {attendance && (
                        <div className="event-dialog-attendance">
                            <div className="event-dialog-attendance-row">
                                <p role="status">{attendance.going ? 'You’re going' : 'You haven’t joined'}</p>
                                <button
                                    type="button"
                                    className="event-dialog-attendance-button"
                                    disabled={attendance.pending}
                                    onClick={() => { void toggleAttendance(); }}
                                >
                                    {attendance.pending ? 'Updating…' : attendance.going ? 'Leave event' : 'Join event'}
                                </button>
                            </div>
                            {attendanceError && <p className="event-dialog-error" role="alert">{attendanceError}</p>}
                        </div>
                    )}
                    <label className="event-field">Event title <input autoFocus required value={title} onChange={e => setTitle(e.target.value)} placeholder="What’s happening?" /></label>
                    <fieldset className="event-colors">
                        <legend>Color</legend>
                        <div className="event-colors-options">
                            {[{ name: 'Default', value: '' }, ...EVENT_COLORS].map(option => (
                                <label key={option.name} className="event-color" title={option.name}>
                                    <input
                                        type="radio"
                                        name={`${headingId}-color`}
                                        value={option.value}
                                        checked={color === option.value}
                                        onChange={() => setColor(option.value)}
                                    />
                                    <span
                                        className={option.value ? 'event-color-swatch' : 'event-color-swatch event-color-default'}
                                        style={option.value ? { background: option.value } : undefined}
                                        aria-hidden="true"
                                    />
                                    <span className="event-visually-hidden">{option.name}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <div className="event-time-row">
                        <label className="event-field">Starts <input type="datetime-local" required value={start} onChange={e => setStart(e.target.value)} /></label>
                        <label className="event-field">Ends <input type="datetime-local" required value={end} onChange={e => setEnd(e.target.value)} /></label>
                    </div>
                    <label className="event-field">Location <span className="event-field-optional">Optional</span><input value={location} onChange={e => setLocation(e.target.value)} placeholder="Add a place or meeting link" /></label>
                    <label className="event-field">Details <span className="event-field-optional">Optional</span><textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Anything people should know?" /></label>
                    <details className="event-dialog-options"><summary>More options <span>Guests, reminders & repeat</span></summary>
                        <div className="event-dialog-extra">
                            <label className="event-field">Guests<input value={guests} onChange={e => setGuests(e.target.value)} placeholder="Email addresses, separated by commas" /><small>Stores guest details; invitations are not sent.</small></label>
                            <div className="event-time-row">
                                <label className="event-field">Reminder<select value={reminder} onChange={e => setReminder(e.target.value)}><option value="">None</option>{[...new Set([5, 10, 15, 30, 60, 1440, ...(reminder ? [Number(reminder)] : [])])].sort((a, b) => a - b).map(minutes => <option key={minutes} value={minutes}>{minutes === 1440 ? '1 day before' : `${minutes} minutes before`}</option>)}</select></label>
                                <label className="event-field">Repeat<select value={recurrence} onChange={e => setRecurrence(e.target.value)}><option value="">Does not repeat</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select></label>
                            </div>
                        </div>
                    </details>
                    {error && <p className="event-dialog-error" role="alert">{error}</p>}
                </div>
                <footer className="event-dialog-footer">
                    {event && onDelete && <button className="event-dialog-delete" type="button" onClick={() => { onDelete(event.id); onClose(); }}>Delete event</button>}
                    <div className="event-dialog-actions"><button className="event-dialog-cancel" type="button" onClick={onClose}>Cancel</button><button className="event-dialog-save" type="submit">{event ? 'Save changes' : 'Create event'} <span aria-hidden="true">↗</span></button></div>
                </footer>
            </form>
        </dialog>
    );
}