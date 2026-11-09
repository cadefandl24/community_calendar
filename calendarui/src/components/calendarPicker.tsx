import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { API_URL } from '../lib/api';
import './CalendarPicker.css';

type CalendarSummary = { id: string; name: string; role: string };
type InviteInfo = { code: string; inviteeEmail: string | null };
type Props = { selectedId: string | null; onSelect: (id: string) => void };
type Action = 'create' | 'join' | 'invite';

const actions = {
    create: {
        button: 'New calendar',
        label: 'Calendar name',
        placeholder: 'e.g. Book club',
        submit: 'Create calendar',
        error: 'Could not create the calendar. Try again.',
    },
    join: {
        button: 'Join with code',
        label: 'Invite code',
        placeholder: 'Paste your code',
        submit: 'Join calendar',
        error: 'Could not join with that code. Check it and try again.',
    },
    invite: {
        button: 'Invite people',
        label: 'Email address (optional)',
        placeholder: 'name@example.com',
        submit: 'Generate invite code',
        error: 'Could not generate an invite code. Try again.',
    },
};

const actionOrder: Action[] = ['create', 'join', 'invite'];

function focusField(input: HTMLInputElement | null) {
    input?.focus();
}

export default function CalendarPicker({ selectedId, onSelect }: Props) {
    const { getAccessTokenSilently } = useAuth0();
    const id = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const [calendars, setCalendars] = useState<CalendarSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [action, setAction] = useState<Action | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [latestInvite, setLatestInvite] = useState<(InviteInfo & { calendarId: string | null }) | null>(null);
    const selectedCalendar = calendars.find(calendar => calendar.id === selectedId);
    const canInvite = selectedCalendar?.role === 'Owner' || selectedCalendar?.role === 'Editor';
    const activeAction = action ? actions[action] : null;
    const inviteInfo = latestInvite?.calendarId === selectedId ? latestInvite : null;

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
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        void loadCalendars();
        return () => controller.abort();
    }, [getAccessTokenSilently]);

    useEffect(() => {
        if (!selectedId && calendars.length > 0) onSelect(calendars[0].id);
    }, [calendars, onSelect, selectedId]);

    function resetPanel(nextAction: Action | null) {
        setAction(nextAction);
        setError('');
    }

    function closePanel() {
        resetPanel(null);
        trigger.current?.focus();
    }

    async function submitAction(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!action || !activeAction || submitting) return;
        if (action === 'invite' && !canInvite) return;

        const form = event.currentTarget;
        const value = String(new FormData(form).get('value') ?? '').trim();
        if (!value && action !== 'invite') {
            setError(`${activeAction.label} is required.`);
            return;
        }

        let path = '/api/calendars';
        let body: { name: string } | { code: string } | { email: string | null; role: string } = { name: value };
        if (action === 'join') {
            path += '/join';
            body = { code: value };
        }
        if (action === 'invite') {
            path += `/${selectedId}/invites`;
            body = { email: value || null, role: 'Editor' };
        }

        setSubmitting(true);
        setError('');
        try {
            const token = await getAccessTokenSilently();
            const response = await fetch(`${API_URL}${path}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(activeAction.error);

            if (action === 'invite') {
                const invite: InviteInfo = await response.json();
                setLatestInvite({ ...invite, calendarId: selectedId });
                form.reset();
            } else {
                const calendar: CalendarSummary = await response.json();
                setCalendars(current => current.some(item => item.id === calendar.id)
                    ? current.map(item => item.id === calendar.id ? calendar : item)
                    : [...current, calendar]);
                onSelect(calendar.id);
                closePanel();
            }
        } catch {
            setError(activeAction.error);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <section className="calendar-picker" aria-label="Calendar controls">
            <div className="calendar-picker-toolbar">
                <div className="calendar-picker-current">
                    <label htmlFor={`${id}-calendar`}>Current calendar</label>
                    <div className="calendar-picker-selection">
                        <select
                            id={`${id}-calendar`}
                            value={selectedId ?? ''}
                            disabled={!calendars.length || submitting}
                            onChange={event => {
                                if (action === 'invite') resetPanel(null);
                                onSelect(event.target.value);
                            }}
                        >
                            {!selectedId && <option value="" disabled>
                                {loading ? 'Loading calendars…' : 'Select a calendar'}
                            </option>}
                            {calendars.map(calendar => (
                                <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                            ))}
                        </select>
                        {selectedCalendar && <span className="calendar-picker-role">{selectedCalendar.role}</span>}
                    </div>
                </div>
                <div className="calendar-picker-actions">
                    {actionOrder.map(item => (item !== 'invite' || canInvite) && (
                        <button
                            key={item}
                            type="button"
                            className={item === 'invite' ? 'calendar-picker-primary' : undefined}
                            aria-expanded={action === item}
                            aria-controls={action === item ? `${id}-panel` : undefined}
                            aria-disabled={loading || submitting}
                            onClick={event => {
                                if (loading || submitting) return;
                                trigger.current = event.currentTarget;
                                resetPanel(action === item ? null : item);
                            }}
                        >
                            {actions[item].button}
                        </button>
                    ))}
                </div>
            </div>
            {loadFailed && <p className="calendar-picker-error" role="alert">Could not load your calendars.</p>}
            {action && activeAction && (
                <form
                    key={action}
                    id={`${id}-panel`}
                    className="calendar-picker-panel"
                    aria-labelledby={`${id}-title`}
                    onSubmit={submitAction}
                    onKeyDown={event => {
                        if (event.key === 'Escape' && !submitting) closePanel();
                    }}
                >
                    <div className="calendar-picker-panel-heading">
                        <h2 id={`${id}-title`}>
                            {action === 'invite' ? `Invite people to ${selectedCalendar?.name}` : activeAction.button}
                        </h2>
                        <button
                            type="button"
                            className="calendar-picker-close"
                            aria-label="Close form"
                            aria-disabled={submitting}
                            onClick={() => { if (!submitting) closePanel(); }}
                        >
                            ×
                        </button>
                    </div>
                    <label htmlFor={`${id}-field`}>{activeAction.label}</label>
                    <div className="calendar-picker-fields">
                        <input
                            ref={focusField}
                            id={`${id}-field`}
                            name="value"
                            type={action === 'invite' ? 'email' : 'text'}
                            placeholder={activeAction.placeholder}
                            required={action !== 'invite'}
                            readOnly={submitting}
                        />
                        <button type="submit" className="calendar-picker-primary" disabled={submitting}>
                            {submitting ? 'Working…' : activeAction.submit}
                        </button>
                    </div>
                    {error && <p className="calendar-picker-error" role="alert">{error}</p>}
                    <div role="status">
                        {action === 'invite' && inviteInfo && (
                            <p className="calendar-picker-code">
                                Share code <strong>{inviteInfo.code}</strong>
                                {inviteInfo.inviteeEmail ? ` (for ${inviteInfo.inviteeEmail})` : ' (anyone with the code)'}
                            </p>
                        )}
                    </div>
                </form>
            )}
        </section>
    );
}
