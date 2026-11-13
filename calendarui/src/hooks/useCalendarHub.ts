import { useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import { API_URL } from '../lib/api';

type Handlers = {
    onEventCreated?: (e: unknown) => void;
    onEventUpdated?: (e: unknown) => void;
    onEventDeleted?: (id: string) => void;
    onMessageCreated?: (message: unknown) => void;
    onMessageDeleted?: (message: { id: string; eventId: string }) => void;
};

export function useCalendarHub(
    calendarId: string | null,
    getToken: () => Promise<string>,
    handlers: Handlers
) {
    const connectionRef = useRef<signalR.HubConnection | null>(null);

    // Always call the latest handlers, even though the connection is only set up once per calendar
    const handlersRef = useRef(handlers);
    useEffect(() => {
        handlersRef.current = handlers;
    });

    useEffect(() => {
        if (!calendarId) return;

        const connection = new signalR.HubConnectionBuilder()
            .withUrl(`${API_URL}/hubs/calendar`, { accessTokenFactory: getToken })
            .withAutomaticReconnect()
            .build();

        connection.on('eventCreated', (e) => handlersRef.current.onEventCreated?.(e));
        connection.on('eventUpdated', (e) => handlersRef.current.onEventUpdated?.(e));
        connection.on('eventDeleted', (id) => handlersRef.current.onEventDeleted?.(id));
        connection.on('messageCreated', (m) => handlersRef.current.onMessageCreated?.(m));
        connection.on('messageDeleted', (m) => handlersRef.current.onMessageDeleted?.(m));
        connection.onreconnected(() => { connection.invoke('JoinCalendar', calendarId).catch(console.error); });

        connection.start()
            .then(() => connection.invoke('JoinCalendar', calendarId))
            .catch(console.error);

        connectionRef.current = connection;

        return () => {
            connection.invoke('LeaveCalendar', calendarId).catch(() => { });
            connection.stop();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calendarId]);
}