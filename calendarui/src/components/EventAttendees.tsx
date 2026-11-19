import { useEffect, useId, useState } from 'react';
import './EventAttendees.css';

type Attendee = { userId: string; username: string | null };

type Props = {
    eventId: string;
    // The ids the calendar already knows; when they change (someone joins or leaves), the names reload
    attendeeIds: string[];
    userId: string | undefined;
    // The Owner, or the Editor who created the event, can take people off the list
    canRemove: boolean;
    api: (path: string, init?: RequestInit) => Promise<unknown>;
    // Called with the updated event the API returns after a removal
    onUpdated: (event: unknown) => void;
};

export default function EventAttendees({ eventId, attendeeIds, userId, canRemove, api, onUpdated }: Props) {
    const id = useId();
    const [attendees, setAttendees] = useState<Attendee[] | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    // Reload the names whenever the list of ids changes
    const idsKey = attendeeIds.join(',');
    useEffect(() => {
        let cancelled = false;
        api(`/event/${eventId}/attendees`)
            .then(result => {
                if (cancelled) return;
                setAttendees(result as Attendee[]);
                setLoadFailed(false);
            })
            .catch(err => {
                if (cancelled) return;
                console.error(err);
                setLoadFailed(true);
            });
        return () => { cancelled = true; };
    }, [api, eventId, idsKey]);

    async function remove(attendee: Attendee, name: string) {
        if (removingId) return;
        setRemovingId(attendee.userId);
        setError('');
        setNotice('');
        try {
            const updated = await api(`/event/${eventId}/attendees/${encodeURIComponent(attendee.userId)}`, { method: 'DELETE' });
            setAttendees(current => current?.filter(a => a.userId !== attendee.userId) ?? null);
            setNotice(`${name} was removed from this event.`);
            onUpdated(updated);
        } catch (err) {
            console.error(err);
            setError(`Could not remove ${name}. Try again.`);
        } finally {
            setRemovingId(null);
            setConfirmId(null);
        }
    }

    const count = attendees?.length ?? attendeeIds.length;

    return (
        <section className="event-attendees" aria-labelledby={`${id}-title`}>
            <h3 id={`${id}-title`}>Who’s going ({count})</h3>

            {loadFailed && <p className="event-dialog-error" role="alert">Could not load who’s going.</p>}
            {!attendees && !loadFailed && <p className="event-attendees-status">Loading…</p>}
            {attendees?.length === 0 && <p className="event-attendees-status">No one has joined yet.</p>}

            {!!attendees?.length && (
                <ul className="event-attendees-list">
                    {attendees.map(attendee => {
                        const isMe = attendee.userId === userId;
                        const name = isMe ? 'You' : (attendee.username?.trim() || 'Calendar member');
                        return (
                            <li key={attendee.userId}>
                                <span className="event-attendees-name">{name}</span>
                                {canRemove && !isMe && (
                                    confirmId === attendee.userId ? (
                                        <span className="event-attendees-actions">
                                            <button type="button" disabled={removingId !== null} onClick={() => setConfirmId(null)}>
                                                Keep
                                            </button>
                                            <button
                                                type="button"
                                                className="event-attendees-danger"
                                                disabled={removingId !== null}
                                                onClick={() => { void remove(attendee, name); }}
                                            >
                                                {removingId === attendee.userId ? 'Removing…' : 'Remove'}
                                            </button>
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            className="event-attendees-remove"
                                            disabled={removingId !== null}
                                            aria-label={`Remove ${name} from this event`}
                                            onClick={() => setConfirmId(attendee.userId)}
                                        >
                                            Remove
                                        </button>
                                    )
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {error && <p className="event-dialog-error" role="alert">{error}</p>}
            <p className="event-attendees-status" role="status">{notice}</p>
        </section>
    );
}