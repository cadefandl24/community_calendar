import { useEffect, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

type CalendarSummary = { id: string; name: string; role: string };

type Props = { selectedId: string | null; onSelect: (id: string) => void };

export default function CalendarPicker({ selectedId, onSelect }: Props) {
    const { getAccessTokenSilently } = useAuth0();
    const [calendars, setCalendars] = useState<CalendarSummary[]>([]);
    const [newName, setNewName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteInfo, setInviteInfo] = useState<{ code: string; email?: string } | null>(null);

    async function authHeaders() {
        const token = await getAccessTokenSilently();
        return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    }

    async function loadCalendars() {
        const res = await fetch('/api/calendars', { headers: await authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        setCalendars(data);
        if (!selectedId && data.length > 0) onSelect(data[0].id);
    }

    useEffect(() => { loadCalendars(); }, []);

    async function createCalendar() {
        if (!newName.trim()) return;
        const res = await fetch('/api/calendars', {
            method: 'POST', headers: await authHeaders(),
            body: JSON.stringify({ name: newName }),
        });
        if (res.ok) {
            const cal = await res.json();
            setNewName('');
            await loadCalendars();
            onSelect(cal.id);
        }
    }

    async function joinCalendar() {
        if (!joinCode.trim()) return;
        const res = await fetch('/api/calendars/join', {
            method: 'POST', headers: await authHeaders(),
            body: JSON.stringify({ code: joinCode.trim() }),
        });
        if (res.ok) {
            const cal = await res.json();
            setJoinCode('');
            await loadCalendars();
            onSelect(cal.id);
        } else {
            alert('Could not join with that code');
        }
    }

    async function createInvite() {
        if (!selectedId) return;
        const res = await fetch(`/api/calendars/${selectedId}/invites`, {
            method: 'POST', headers: await authHeaders(),
            body: JSON.stringify({ email: inviteEmail.trim() || null, role: 'Editor' }),
        });
        if (res.ok) {
            const data = await res.json();
            setInviteInfo({ code: data.code, email: data.inviteeEmail });
            setInviteEmail('');
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderBottom: '1px solid #ccc' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: 13 }}>Calendar:</label>
                <select value={selectedId ?? ''} onChange={e => onSelect(e.target.value)}>
                    {calendars.map(c => <option key={c.id} value={c.id}>{c.name}({c.role})</option>)}
                </select>
                <input placeholder="New calendar name" value={newName} onChange={e => setNewName(e.target.value)} style={{ width: 140 }} />
                <button onClick={createCalendar}>Create</button>
                <input placeholder="Invite code" value={joinCode} onChange={e => setJoinCode(e.target.value)} style={{ width: 100 }} />
                <button onClick={joinCalendar}>Join</button>
            </div>
            {selectedId && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input placeholder="Invite by email (optional)" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} style={{ width: 200 }} />
                    <button onClick={createInvite}>Generate invite</button>
                    {inviteInfo && (
                        <span style={{ fontSize: 12 }}>
                            Share code: <strong>{inviteInfo.code}</strong>
                            {inviteInfo.email ? ` (for ${inviteInfo.email})` : ' (anyone with code)'}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}