import { useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';

type Handlers = {
    onEventCreated?: (e: any) => void;
    onEventUpdated?: (e: any) => void;
    onEventDeleted?: (id: string) => void;
};

export function useCalendarHub(
    calendarId: string | null,
    getToken: () => Promise<string>,
    handlers: Handlers
) {
    const connectionRef = useRef<signalR.HubConnection | null>(null);

    useEffect(() => {
        if (!calendarId) return;

        const connection = new signalR.HubConnectionBuilder()
            .withUrl('/hubs/calendar', { accessTokenFactory: getToken })
            .withAutomaticReconnect()
            .build();

        connection.on('eventCreated', (e) => handlers.onEventCreated?.(e));
        connection.on('eventUpdated', (e) => handlers.onEventUpdated?.(e));
        connection.on('eventDeleted', (id) => handlers.onEventDeleted?.(id));
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