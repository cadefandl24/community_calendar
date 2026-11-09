import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { API_URL } from '../lib/api';
import './CalendarPicker.css';

type CalendarSummary = { id: string; name: string; role: string };
type InviteInfo = { code: string; inviteeEmail: string | null };
type Props = { selectedId: string | null; onSelect: (id: string | null) => void };
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

function focusControl(control: HTMLElement | null) {
    control?.focus();
}

export default function CalendarPicker({ selectedId, onSelect }: Props) {
    const { getAccessTokenSilently } = useAuth0();
    const id = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const manage = useRef<HTMLDetailsElement>(null);
    const manageTrigger = useRef<HTMLElement>(null);
    const newCalendarButton = useRef<HTMLButtonElement>(null);
    const [calendars, setCalendars] = useState<CalendarSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [action, setAction] = useState<Action | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<CalendarSummary | null>(null);
    const [notice, setNotice] = useState('');
    const [latestInvite, setLatestInvite] = useState<(InviteInfo & { calendarId: string | null }) | null>(null);
    const selectedCalendar = calendars.find(calendar => calendar.id === selectedId);
    const canInvite = selectedCalendar?.role === 'Owner' || selectedCalendar?.role === 'Editor';
    const activeAction = action ? actions[action] : null;
    const inviteInfo = latestInvite?.calendarId === selectedId ? latestInvite : null;
    const controlsLocked = submitting || deleteTarget !== null;

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

    function cancelDelete() {
        if (submitting) return;
        setDeleteTarget(null);
        setError('');
        manageTrigger.current?.focus();
    }

    async function deleteCalendar(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!deleteTarget || submitting) return;

        setSubmitting(true);
        setError('');
        try {
            const token = await getAccessTokenSilently();
            const response = await fetch(`${API_URL}/api/calendars/${deleteTarget.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error('Delete failed');

            const index = calendars.findIndex(calendar => calendar.id === deleteTarget.id);
            const remaining = calendars.filter(calendar => calendar.id !== deleteTarget.id);
            const nextCalendar = remaining[index] ?? remaining.at(-1);
            setCalendars(remaining);
            onSelect(nextCalendar?.id ?? null);
            setLatestInvite(invite => invite?.calendarId === deleteTarget.id ? null : invite);
            setDeleteTarget(null);
            setNotice(`“${deleteTarget.name}” was deleted.`);
            newCalendarButton.current?.focus();
        } catch {
            setError('Could not delete the calendar. Try again.');
        } finally {
            setSubmitting(false);
        }
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
                            disabled={!calendars.length || controlsLocked}
                            onChange={event => {
                                if (action === 'invite') resetPanel(null);
                                onSelect(event.target.value);
                            }}
                        >
                            {!selectedId && <option value="" disabled>
                                {loading ? 'Loading calendars…' : calendars.length ? 'Select a calendar' : 'No calendars'}
                            </option>}
                            {calendars.map(calendar => (
                                <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                            ))}
                        </select>
                        {selectedCalendar && <span className="calendar-picker-role">{selectedCalendar.role}</span>}
                        {selectedCalendar?.role === 'Owner' && (
                            <details
                                ref={manage}
                                className="calendar-picker-manage"
                                onBlur={event => {
                                    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
                                        event.currentTarget.open = false;
                                    }
                                }}
                                onKeyDown={event => {
                                    if (event.key !== 'Escape' || !event.currentTarget.open) return;
                                    event.currentTarget.open = false;
                                    manageTrigger.current?.focus();
                                }}
                            >
                                <summary
                                    ref={manageTrigger}
                                    aria-label="Calendar actions"
                                    aria-disabled={controlsLocked}
                                    onClick={event => { if (controlsLocked) event.preventDefault(); }}
                                >
                                    ⋯
                                </summary>
                                <div className="calendar-picker-menu">
                                    <button
                                        type="button"
                                        disabled={controlsLocked}
                                        onClick={() => {
                                            if (manage.current) manage.current.open = false;
                                            resetPanel(null);
                                            setNotice('');
                                            setDeleteTarget(selectedCalendar);
                                        }}
                                    >
                                        Delete calendar
                                    </button>
                                </div>
                            </details>
                        )}
                    </div>
                </div>
                <div className="calendar-picker-actions">
                    {actionOrder.map(item => (item !== 'invite' || canInvite) && (
                        <button
                            key={item}
                            ref={item === 'create' ? newCalendarButton : undefined}
                            type="button"
                            className={item === 'invite' ? 'calendar-picker-primary' : undefined}
                            aria-expanded={action === item}
                            aria-controls={action === item ? `${id}-panel` : undefined}
                            aria-disabled={loading || controlsLocked}
                            onClick={event => {
                                if (loading || controlsLocked) return;
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
            <p className="calendar-picker-notice" role="status">{notice}</p>
            {deleteTarget && (
                <form
                    className="calendar-picker-confirm"
                    aria-labelledby={`${id}-delete-title`}
                    aria-describedby={`${id}-delete-description`}
                    onSubmit={deleteCalendar}
                    onKeyDown={event => { if (event.key === 'Escape') cancelDelete(); }}
                >
                    <h2 id={`${id}-delete-title`}>Delete “{deleteTarget.name}”?</h2>
                    <p id={`${id}-delete-description`}>This permanently removes the calendar, its events, and access for everyone it’s shared with.</p>
                    {error && <p className="calendar-picker-error" role="alert">{error}</p>}
                    <div className="calendar-picker-confirm-actions">
                        <button ref={focusControl} type="button" disabled={submitting} onClick={cancelDelete}>Cancel</button>
                        <button type="submit" className="calendar-picker-danger" disabled={submitting}>
                            {submitting ? 'Deleting…' : 'Delete calendar'}
                        </button>
                    </div>
                </form>
            )}
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
                            ref={focusControl}
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
