import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import CalendarPage from "../src/pages/CalendarPage";
import AccountDropdown from "../src/components/AccountDropdown";
import RecentCalendars from "../src/components/RecentCalendars";

// The open calendar lives in the address bar (/?calendar=<id>) so Back, Refresh and bookmarks work
function calendarIdFromUrl() {
  return new URLSearchParams(window.location.search).get("calendar");
}

function LandingPage() {
  const { loginWithRedirect, logout, isLoading, error, isAuthenticated, user } = useAuth0();
  const [openCalendarId, setOpenCalendarId] = useState(calendarIdFromUrl);

  // Back/Forward buttons: follow the address bar
  useEffect(() => {
    const onPopState = () => setOpenCalendarId(calendarIdFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Auth0's Application Login URI points at /login: start a login there,
  // or go home if already logged in (stops the "Missing required parameter" error)
  useEffect(() => {
    if (isLoading || window.location.pathname !== "/login") return;
    if (isAuthenticated) window.history.replaceState(null, "", "/");
    else loginWithRedirect();
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  function openCalendar(id) {
    window.history.pushState(null, "", `/?calendar=${encodeURIComponent(id)}`);
    setOpenCalendarId(id);
  }

  function goHome() {
    window.history.pushState(null, "", "/");
    setOpenCalendarId(null);
  }

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Authentication error: {error.message}</p>;
  if (isAuthenticated && openCalendarId) {
    return <CalendarPage key={openCalendarId} initialCalendarId={openCalendarId} onHome={goHome} />;
  }

  return (
    <>
      <header className="navbar">
        {isAuthenticated && (
          <a className="logo" href="/">
            <img className="logo-image" src="https://i.postimg.cc/1tbn8tT4/New-Calendar-Logo.png" alt="" />
            <span>Community Calendar</span>
          </a>
        )}
        {isAuthenticated && (
          <div className="navbar-account">
            <AccountDropdown key={user?.sub} user={user} />
            <button
              className="button navbar-logout"
              type="button"
              onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            >
              Log out
            </button>
          </div>
        )}
      </header>

      <main className="landing-main">
        <section className="hero">
        {!isAuthenticated && (
          <img className="hero-logo" src="https://i.postimg.cc/Dwx9Qbc8/Calendar-(1).png" alt="Community Calendar" />
        )}
          <h1>Your community.<br />All in one calendar.</h1>
          {!isAuthenticated && (
            <>
              <button
                className="button"
                onClick={() =>
                  loginWithRedirect({
                    authorizationParams: { screen_hint: "signup" },
                  })
                }
              >
                Sign Up
              </button>
              <button
                className="button"
                onClick={() =>
                  loginWithRedirect({
                    authorizationParams: { screen_hint: "login" },
                  })
                }
              >
                Login
              </button>
            </>
          )}
        </section>

        {isAuthenticated && <RecentCalendars onOpen={openCalendar} />}

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
  <Auth0Provider
    domain={import.meta.env.VITE_AUTH0_DOMAIN}
    clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
    cacheLocation="localstorage"
    useRefreshTokens={true}
    authorizationParams={{
      redirect_uri: window.location.origin,
      audience: import.meta.env.VITE_AUTH0_AUDIENCE,
    }}
  >
    <LandingPage />
  </Auth0Provider>
);