import { useState } from 'react';
import { Scheduler } from 'calendarkit-pro';
import '../index.css';
import './CalendarPage.css';

export default function CalendarPage() {
  const [showCalendar, setShowCalendar] = useState(false);
  const [view, setView] = useState('month');
  const [date, setDate] = useState(new Date());

  return (
    <main>
      <h1>Community Calendar</h1>
      {showCalendar ? (
        <div style={{ height: '700px', textAlign: 'left' }}>
          <Scheduler
            events={[]}
            view={view}
            onViewChange={setView}
            date={date}
            onDateChange={setDate}
            readOnly
          />
        </div>
      ) : (
        <>
          <h2>Bring Everyone Together</h2>
          <h3>Create Your First Calendar Below</h3>
          <button className="create-calendar-button" type="button" onClick={() => setShowCalendar(true)}>
            Create Calendar
          </button>
        </>
      )}
    </main>
  );
}
