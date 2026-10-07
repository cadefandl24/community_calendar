import React from "react";
import { createRoot } from 'react-dom/client';

export default function CalendarPage() {
  return (
    <main>
      <h1>Community Calendar</h1>
      <h2> Bring Everyone Together</h2>
      <h3> Create Your First Calendar Below</h3>
      <button>Click Me</button>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<CalendarPage />);