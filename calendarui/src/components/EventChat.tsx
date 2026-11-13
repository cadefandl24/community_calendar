import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import './EventChat.css';

// A chat message as the C# API sends it (see EventMessageDtos.cs)
export type ChatMessage = {
    id: string;
    eventId: string;
    userId: string;
    authorName: string;
    body: string;
    createdAt: string;   // kept as the API's text so it can be sent back exactly when loading older messages
};

type MessagePage = { messages: ChatMessage[]; hasMore: boolean };

type Props = {
    eventId: string;
    userId: string | undefined;
    api: (path: string, init?: RequestInit) => Promise<unknown>;
    // Live messages arrive here from the calendar's SignalR connection
    bus: EventTarget;
};

const MAX_LENGTH = 2000;

const timeFormat = new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

export default function EventChat({ eventId, userId, api, bus }: Props) {
    const id = useId();
    const list = useRef<HTMLOListElement>(null);
    const stickToBottom = useRef(true);
    const keepScrollFrom = useRef<number | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [hasMore, setHasMore] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const path = `/event/${eventId}/messages`;

    // Add messages, skipping any already shown (my own message arrives twice: from my POST and from SignalR)
    const addMessages = useCallback((incoming: ChatMessage[], atStart = false) => {
        setMessages(current => {
            const known = new Set(current.map(m => m.id));
            const fresh = incoming.filter(m => !known.has(m.id));
            if (fresh.length === 0) return current;
            return atStart ? [...fresh, ...current] : [...current, ...fresh];
        });
    }, []);

    // First load: the newest messages
    useEffect(() => {
        let cancelled = false;
        api(path)
            .then(result => {
                const page = result as MessagePage;
                if (cancelled) return;
                setMessages(page.messages);
                setHasMore(page.hasMore);
                setStatus('ready');
            })
            .catch(err => {
                if (cancelled) return;
                console.error(err);
                setStatus('error');
            });
        return () => { cancelled = true; };
    }, [api, path]);

    // Live updates from other people
    useEffect(() => {
        function onCreated(e: Event) {
            const message = (e as CustomEvent<ChatMessage>).detail;
            if (message.eventId === eventId) addMessages([message]);
        }
        function onDeleted(e: Event) {
            const { id: deletedId, eventId: fromEvent } = (e as CustomEvent<{ id: string; eventId: string }>).detail;
            if (fromEvent === eventId) setMessages(current => current.filter(m => m.id !== deletedId));
        }
        bus.addEventListener('messageCreated', onCreated);
        bus.addEventListener('messageDeleted', onDeleted);
        return () => {
            bus.removeEventListener('messageCreated', onCreated);
            bus.removeEventListener('messageDeleted', onDeleted);
        };
    }, [bus, eventId, addMessages]);

    // Keep the view in the right place when messages change:
    // older messages loaded at the top -> stay where you were;
    // new message at the bottom -> follow it, unless you've scrolled up to read.
    useLayoutEffect(() => {
        const element = list.current;
        if (!element) return;
        if (keepScrollFrom.current !== null) {
            element.scrollTop = element.scrollHeight - keepScrollFrom.current;
            keepScrollFrom.current = null;
        } else if (stickToBottom.current) {
            element.scrollTop = element.scrollHeight;
        }
    }, [messages]);

    function onScroll() {
        const element = list.current;
        if (!element) return;
        stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
    }

    async function loadOlder() {
        if (loadingOlder || messages.length === 0) return;
        setLoadingOlder(true);
        setError('');
        try {
            const before = encodeURIComponent(messages[0].createdAt);
            const page = await api(`${path}?before=${before}`) as MessagePage;
            if (list.current) keepScrollFrom.current = list.current.scrollHeight - list.current.scrollTop;
            addMessages(page.messages, true);
            setHasMore(page.hasMore);
        } catch (err) {
            console.error(err);
            setError('Could not load older messages. Try again.');
        } finally {
            setLoadingOlder(false);
        }
    }

    async function send() {
        const body = draft.trim();
        if (!body || sending) return;
        if (body.length > MAX_LENGTH) {
            setError(`Messages can be up to ${MAX_LENGTH} characters.`);
            return;
        }
        setSending(true);
        setError('');
        try {
            const saved = await api(path, { method: 'POST', body: JSON.stringify({ body }) }) as ChatMessage;
            stickToBottom.current = true;
            addMessages([saved]);
            setDraft('');
        } catch (err) {
            console.error(err);
            setError('Could not send your message. Try again.');
        } finally {
            setSending(false);
        }
    }

    async function remove(messageId: string) {
        setError('');
        try {
            await api(`${path}/${messageId}`, { method: 'DELETE' });
            setMessages(current => current.filter(m => m.id !== messageId));
        } catch (err) {
            console.error(err);
            setError('Could not delete the message. Try again.');
        } finally {
            setConfirmDeleteId(null);
        }
    }

    // Enter sends, Shift+Enter makes a new line
    function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
        }
    }

    return (
        <section className="event-chat" aria-labelledby={`${id}-title`}>
            <h3 id={`${id}-title`}>Chat</h3>

            {status === 'loading' && <p className="event-chat-status" role="status">Loading messages…</p>}
            {status === 'error' && <p className="event-dialog-error" role="alert">Could not load the chat.</p>}

            {status === 'ready' && (
                <>
                    {hasMore && (
                        <button type="button" className="event-chat-older" disabled={loadingOlder} onClick={() => { void loadOlder(); }}>
                            {loadingOlder ? 'Loading…' : 'Load older messages'}
                        </button>
                    )}
                    {messages.length === 0 ? (
                        <p className="event-chat-status">No messages yet. Say hello!</p>
                    ) : (
                        <ol ref={list} className="event-chat-list" role="log" aria-label="Messages" onScroll={onScroll}>
                            {messages.map(message => {
                                const mine = message.userId === userId;
                                return (
                                    <li key={message.id} className={mine ? 'event-chat-message event-chat-mine' : 'event-chat-message'}>
                                        <div className="event-chat-meta">
                                            <span className="event-chat-author">{mine ? 'You' : message.authorName}</span>
                                            <time dateTime={message.createdAt}>{timeFormat.format(new Date(message.createdAt))}</time>
                                        </div>
                                        <p className="event-chat-body">{message.body}</p>
                                        {mine && (
                                            confirmDeleteId === message.id ? (
                                                <div className="event-chat-confirm">
                                                    <button type="button" onClick={() => setConfirmDeleteId(null)}>Keep</button>
                                                    <button type="button" className="event-chat-danger" onClick={() => { void remove(message.id); }}>Delete</button>
                                                </div>
                                            ) : (
                                                <button type="button" className="event-chat-delete" onClick={() => setConfirmDeleteId(message.id)}>
                                                    Delete<span className="event-visually-hidden"> message</span>
                                                </button>
                                            )
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                    )}

                    <div className="event-chat-compose">
                        <label htmlFor={`${id}-input`} className="event-visually-hidden">Message</label>
                        <textarea
                            id={`${id}-input`}
                            rows={2}
                            maxLength={MAX_LENGTH}
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={onKeyDown}
                            placeholder="Write a message…"
                        />
                        <button type="button" className="event-chat-send" disabled={sending || !draft.trim()} onClick={() => { void send(); }}>
                            {sending ? 'Sending…' : 'Send'}
                        </button>
                    </div>
                    <p className="event-chat-hint">Enter to send · Shift+Enter for a new line</p>
                </>
            )}

            {error && <p className="event-dialog-error" role="alert">{error}</p>}
        </section>
    );
}