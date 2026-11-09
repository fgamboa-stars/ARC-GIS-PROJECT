import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppStateProvider } from "./state/AppStateProvider";
import "./styles/global.css";
import "./styles/app.css";

// Superseded requests (basemap swaps, re-queries) are cancelled on purpose; don't report them as failures.
window.addEventListener("unhandledrejection", (event) => {
  if ((event.reason as { name?: string } | null)?.name === "AbortError") event.preventDefault();
});

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </ErrorBoundary>
  </StrictMode>,
);
