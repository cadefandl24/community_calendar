import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { API_URL } from '../lib/api';

type Member = { userId: string; username: string | null; role: string };
type Props = {
    id: string;
    calendarId: string;
    calendarName: string;
    canManageRoles?: boolean;
    onClose: () => void;
};

export default function CalendarMembers({ id, calendarId, calendarName, canManageRoles = false, onClose }: Props) {
    const { getAccessTokenSilently } = useAuth0();
    const [members, setMembers] = useState<Member[] | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [savingUserId, setSavingUserId] = useState<string | null>(null);
    const [roleError, setRoleError] = useState('');
    const [roleNotice, setRoleNotice] = useState('');
    const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

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

    async function changeRole(member: Member, role: string) {
            if (role === member.role || savingUserId) return;
            setSavingUserId(member.userId);
            setRoleError('');
            setRoleNotice('');
            try {
                const token = await getAccessTokenSilently();
                const response = await fetch(
                    `${API_URL}/api/calendars/${calendarId}/members/${encodeURIComponent(member.userId)}`,
                    {
                        method: 'PATCH',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ role }),
                    },
                );
                if (!response.ok) throw new Error('Could not change role');
                setMembers(current => current?.map(m => m.userId === member.userId ? { ...m, role } : m) ?? null);
                setRoleNotice(`${member.username?.trim() || 'Member'} is now ${role === 'Editor' ? 'an Editor' : 'a Viewer'}.`);
            } catch {
                setRoleError('Could not change that role. Try again.');
            } finally {
                setSavingUserId(null);
            }
        }

    // Owner only: take someone out of the calendar
    async function removeMember(member: Member) {
        if (savingUserId) return;
        const name = member.username?.trim() || 'Member';
        setSavingUserId(member.userId);
        setRoleError('');
        setRoleNotice('');
        try {
            const token = await getAccessTokenSilently();
            const response = await fetch(
                `${API_URL}/api/calendars/${calendarId}/members/${encodeURIComponent(member.userId)}`,
                { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
            );
            if (!response.ok) throw new Error('Could not remove member');
            setMembers(current => current?.filter(m => m.userId !== member.userId) ?? null);
            setRoleNotice(`${name} was removed from ${calendarName}.`);
        } catch {
            setRoleError(`Could not remove ${name}. Try again.`);
        } finally {
            setSavingUserId(null);
            setConfirmRemoveId(null);
        }
    }

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
                    {members.map(member => {
                        const name = member.username?.trim() || 'Calendar member';
                        return (
                            <li key={member.userId}>
                                <span>{name}</span>
                                {canManageRoles && member.role !== 'Owner' ? (
                                    confirmRemoveId === member.userId ? (
                                        <span className="calendar-picker-member-actions">
                                            <span>Remove {name}?</span>
                                            <button type="button" disabled={savingUserId !== null} onClick={() => setConfirmRemoveId(null)}>
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                className="calendar-picker-danger"
                                                disabled={savingUserId !== null}
                                                onClick={() => { void removeMember(member); }}
                                            >
                                                {savingUserId === member.userId ? 'Removing…' : 'Remove'}
                                            </button>
                                        </span>
                                    ) : (
                                        <span className="calendar-picker-member-actions">
                                            <select
                                                className="calendar-picker-member-role"
                                                aria-label={`Role for ${name}`}
                                                value={member.role}
                                                disabled={savingUserId !== null}
                                                onChange={event => { void changeRole(member, event.target.value); }}
                                            >
                                                <option value="Viewer">Viewer</option>
                                                <option value="Editor">Editor</option>
                                            </select>
                                            <button
                                                type="button"
                                                disabled={savingUserId !== null}
                                                aria-label={`Remove ${name} from the calendar`}
                                                onClick={() => setConfirmRemoveId(member.userId)}
                                            >
                                                Remove
                                            </button>
                                        </span>
                                    )
                                ) : (
                                    <span className="calendar-picker-role">{member.role}</span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
            {roleError && <p className="calendar-picker-error" role="alert">{roleError}</p>}
            <p className="calendar-picker-notice" role="status">{roleNotice}</p>
        </section>
    );
}