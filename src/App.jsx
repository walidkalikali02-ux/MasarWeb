import React from "react";
import Sentry from "./sentry";

// Add this button component to your app to test Sentry's error tracking
function ErrorButton() {
  return (
    <button
      onClick={() => {
        throw new Error('This is your first error!');
      }}
    >
      Break the world
    </button>
  );
}

function App() {
  return (
    <div>
      <h1>MasarWeb React Frontend</h1>
      <p>Welcome to the React frontend of MasarWeb Proxy</p>
      <ErrorButton />
    </div>
  );
}

export default App;