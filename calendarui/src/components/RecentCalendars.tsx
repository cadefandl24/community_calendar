import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { API_URL } from '../lib/api';
import './RecentCalendars.css';

type CalendarSummary = { id: string; name: string; role: string };
type Props = {
    // Opens the calendar page on this calendar
    onOpen: (calendarId: string) => void;
};

const RECENT_COUNT = 2;

const forms = {
    create: {
        label: 'Calendar name', placeholder: 'e.g. Book club', submit: 'Create', busy: 'Creating…',
        path: '/api/calendars', field: 'name', error: 'Could not create the calendar. Try again.',
    },
    join: {
        label: 'Invite code', placeholder: 'Paste your code', submit: 'Join', busy: 'Joining…',
        path: '/api/calendars/join', field: 'code', error: 'Could not join with that code. Check it and try again.',
    },
};
type FormKind = keyof typeof forms;

// Bottom of the signed-in landing page: my 2 most recently used calendars and a "Create new calendar" button
export default function RecentCalendars({ onOpen }: Props) {
    const { getAccessTokenSilently } = useAuth0();
    const [calendars, setCalendars] = useState<CalendarSummary[] | null>(null);   // null = still loading
    const [loadFailed, setLoadFailed] = useState(false);
    const [openForm, setOpenForm] = useState<FormKind | null>(null);   // which form is showing, if any
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const nameInput = useRef<HTMLInputElement>(null);
    const createButton = useRef<HTMLButtonElement>(null);
    const form = openForm ? forms[openForm] : null;

    // The API already sorts calendars with the most recently used first
    useEffect(() => {
        const controller = new AbortController();

        async function loadCalendars() {
            try {
                const token = await getAccessTokenSilently();
                const response = await fetch(`${API_URL}/api/calendars`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error('Could not load calendars');
                const data: CalendarSummary[] = await response.json();
                if (!controller.signal.aborted) setCalendars(data);
            } catch {
                if (!controller.signal.aborted) setLoadFailed(true);
            }
        }

        void loadCalendars();
        return () => controller.abort();
    }, [getAccessTokenSilently]);

    useEffect(() => {
        if (openForm) nameInput.current?.focus();
    }, [openForm]);

    function closeForm() {
        setOpenForm(null);
        setError('');
        createButton.current?.focus();
    }

    // Creates a calendar or joins one with an invite code, then opens it
    async function submitForm(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!form || submitting) return;
        const value = String(new FormData(event.currentTarget).get('value') ?? '').trim();
        if (!value) {
            setError(`${form.label} is required.`);
            return;
        }

        setSubmitting(true);
        setError('');
        try {
            const token = await getAccessTokenSilently();
            const response = await fetch(`${API_URL}${form.path}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ [form.field]: value }),
            });
            if (!response.ok) {
                // Show the API's own message for joins (e.g. "This invite was sent to …")
                let message = form.error;
                try {
                    const data = await response.json();
                    if (openForm === 'join' && typeof data?.error === 'string') message = data.error;
                } catch { /* no JSON body; keep the general message */ }
                throw new Error(message);
            }
            const calendar: CalendarSummary = await response.json();
            onOpen(calendar.id);   // go straight to the calendar
        } catch (err) {
            setError(err instanceof Error && err.message ? err.message : form.error);
            setSubmitting(false);
        }
    }

    const recent = calendars?.slice(0, RECENT_COUNT) ?? [];

    return (
        <section className="recent-calendars" aria-labelledby="recent-calendars-heading">
            <h2 id="recent-calendars-heading">Your recent calendars</h2>

            {loadFailed ? (
                <p role="alert" className="recent-calendars-message">Could not load your calendars. Refresh the page to try again.</p>
            ) : calendars === null ? (
                <p className="recent-calendars-message">Loading your calendars…</p>
            ) : recent.length === 0 ? (
                <p className="recent-calendars-message">You're not in any calendars yet. Create one, or ask someone for an invite.</p>
            ) : (
                <ul className="recent-calendars-list">
                    {recent.map(calendar => (
                        <li key={calendar.id}>
                            <button type="button" className="recent-calendar-card" onClick={() => onOpen(calendar.id)}>
                                <span className="recent-calendar-name">{calendar.name}</span>
                                <span className="recent-calendar-role">{calendar.role}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {form ? (
                <form key={openForm} className="recent-calendars-create" onSubmit={submitForm}>
                    <label htmlFor="recent-calendars-value">{form.label}</label>
                    <div className="recent-calendars-create-row">
                        <input
                            ref={nameInput}
                            id="recent-calendars-value"
                            name="value"
                            maxLength={100}
                            placeholder={form.placeholder}
                            autoComplete="off"
                            disabled={submitting}
                            aria-describedby={error ? 'recent-calendars-error' : undefined}
                        />
                        <button type="submit" className="button" disabled={submitting}>
                            {submitting ? form.busy : form.submit}
                        </button>
                        <button type="button" className="recent-calendars-link" onClick={closeForm} disabled={submitting}>
                            Cancel
                        </button>
                    </div>
                    {error && <p id="recent-calendars-error" role="alert" className="recent-calendars-error">{error}</p>}
                </form>
            ) : (
                <div className="recent-calendars-actions">
                    <button ref={createButton} type="button" className="button recent-calendars-new" onClick={() => setOpenForm('create')}>
                        Create new calendar
                    </button>
                    <button type="button" className="recent-calendars-link" onClick={() => setOpenForm('join')}>
                        Join with a code
                    </button>
                    {calendars && calendars.length > RECENT_COUNT && (
                        <button type="button" className="recent-calendars-link" onClick={() => onOpen(calendars[0].id)}>
                            See all {calendars.length} calendars
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}