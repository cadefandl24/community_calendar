import { useEffect, useId, useState } from 'react';
import type { CalendarEvent } from 'calendarkit-pro';

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

type Props = {
  events: CalendarEvent[];
  status: 'loading' | 'ready' | 'error';
};

export default function UpcomingEvents({ events, status }: Props) {
  const headingId = useId();
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const upcoming = events
    .filter(event => event.start.getTime() >= now || (event.allDay && event.end.getTime() > now))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 3);

  return (
    <section className="community-up-next" aria-labelledby={headingId}>
      <h2 id={headingId}>Up next</h2>
      {status === 'loading' && <p>Loading events…</p>}
      {status === 'error' && <p>Could not load events.</p>}
      {status === 'ready' && upcoming.length === 0 && <p>No upcoming events</p>}
      {upcoming.map(event => (
        <details key={event.id} name={headingId}>
          <summary>
            <span className="community-up-next-dot" aria-hidden="true" />
            <span>
              <time dateTime={event.start.toISOString()}>
                {dateFormat.format(event.start)} · {event.allDay ? 'All day' : timeFormat.format(event.start)}
              </time>
              <strong>{event.title}</strong>
            </span>
            <span className="community-up-next-arrow" aria-hidden="true">›</span>
          </summary>
          {!event.allDay && <p>Ends {dateFormat.format(event.end)} · {timeFormat.format(event.end)}</p>}
          {event.description && <p>{event.description}</p>}
          {event.allDay && !event.description && <p>All-day event</p>}
        </details>
      ))}
    </section>
  );
}
