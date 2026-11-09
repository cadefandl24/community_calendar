import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { API_URL } from '../lib/api';

type Member = { userId: string; displayName: string | null; role: string };
type Props = {
    id: string;
    calendarId: string;
    calendarName: string;
    onClose: () => void;
};

export default function CalendarMembers({ id, calendarId, calendarName, onClose }: Props) {
    const { getAccessTokenSilently } = useAuth0();
    const [members, setMembers] = useState<Member[] | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);

    useEffect(() => {
        const controller = new AbortController();

        async function loadMembers() {
            try {
                const token = await getAccessTokenSilently();
                const response = await fetch(`${API_URL}/api/calendars/${calendarId}/members`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error('Could not load calendar members');
                const data: Member[] = await response.json();
                if (!controller.signal.aborted) setMembers(data);
            } catch {
                if (!controller.signal.aborted) setLoadFailed(true);
            }
        }

        void loadMembers();
        return () => controller.abort();
    }, [calendarId, getAccessTokenSilently]);

    return (
        <section
            id={id}
            className="calendar-picker-panel"
            aria-labelledby={`${id}-title`}
            onKeyDown={event => { if (event.key === 'Escape') onClose(); }}
        >
            <div className="calendar-picker-panel-heading">
                <h2 id={`${id}-title`}>Members of {calendarName}</h2>
                <button
                    type="button"
                    className="calendar-picker-close"
                    aria-label="Close members"
                    autoFocus
                    onClick={onClose}
                >
                    ×
                </button>
            </div>
            {loadFailed && <p className="calendar-picker-error" role="alert">Could not load calendar members.</p>}
            {!members && !loadFailed && <p role="status">Loading members…</p>}
            {members?.length === 0 && <p>No calendar members</p>}
            {!!members?.length && (
                <ul className="calendar-picker-members">
                    {members.map(member => (
                        <li key={member.userId}>
                            <span>{member.displayName?.trim() || 'Calendar member'}</span>
                            <span className="calendar-picker-role">{member.role}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
