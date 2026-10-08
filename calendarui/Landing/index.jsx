import React from "react";
import { createRoot } from "react-dom/client";
import { Auth0Provider, useAuth0 } from "@auth0/auth0-react";
import CalendarPage from "../src/pages/CalendarPage";


function LandingPage() {
  const { loginWithRedirect, isLoading, error, isAuthenticated } = useAuth0();

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Authentication error: {error.message}</p>;
  if (isAuthenticated) return <CalendarPage />;

  return (
    <>
      <header className="navbar">
        <a className="logo" href="#">Community Calendar</a>
      </header>

      <main>
        <section className="hero">
          <h1>Your community.<br />All in one calendar.</h1>
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
  <Auth0Provider
    domain={import.meta.env.VITE_AUTH0_DOMAIN}
    clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
    authorizationParams={{
      redirect_uri: window.location.origin,
    }}
  >
    <LandingPage />
  </Auth0Provider>
);
  
