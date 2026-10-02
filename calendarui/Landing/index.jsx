import React from "react";
import { createRoot } from "react-dom/client";

/*
const events = [
  {
    title: "Farmers Market",
    date: "Saturday · 9 AM",
    location: "Town Square",
    emoji: "🥕",
  },
  {
    title: "Outdoor Concert",
    date: "Friday · 6 PM",
    location: "Riverside Park",
    emoji: "🎵",
  },
  {
    title: "Community Workshop",
    date: "Sunday · 2 PM",
    location: "Community Center",
    emoji: "🎨",
  },
];

function EventCard({ event }) {
  return (
    <article className="event-card">
      <span className="event-icon" aria-hidden="true">
        {event.emoji}
      </span>
      <p className="event-date">{event.date}</p>
      <h3>{event.title}</h3>
      <p>{event.location}</p>
    </article>
  );
}
*/

function LandingPage() {
  return (
    <>
      <header className="navbar">
        <a className="logo" href="#">Community Calendar</a>
      </header>

      <main>
        <section className="hero">
          <h1>Your community.<br />All in one calendar.</h1>
          <button className="button">
            Sign Up
          </button>
          <button className="button">
            Login
          </button>
        </section>


        {/* <section id="about" className="section about">
          <h2>Good plans start here</h2>
          <div className="steps">
            <div>
              <h3>1. Find an event</h3>
              <p>Discover something happening nearby.</p>
            </div>
            <div>
              <h3>2. Check the details</h3>
              <p>See when and where it’s happening.</p>
            </div>
            <div>
              <h3>3. Make a plan</h3>
              <p>Bring a friend and join your community.</p>
            </div>
          </div>
        </section> */}
      </main>

      <footer>Community Calendar · Make room for community.</footer>
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <LandingPage />
);