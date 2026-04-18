import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import "leaflet/dist/leaflet.css";
import "./index.css";
import "./i18n";
import { ThemePreference, getStoredThemePreference, initializeThemePreference } from "./preferences";

initializeThemePreference();

const AppToaster = () => {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredThemePreference());

  useEffect(() => {
    const syncTheme = () => setTheme(getStoredThemePreference());

    window.addEventListener("storage", syncTheme);
    window.addEventListener("soli-car-theme-change", syncTheme as EventListener);

    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("soli-car-theme-change", syncTheme as EventListener);
    };
  }, []);

  const isDark = theme === "dark";

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3500,
        style: {
          borderRadius: "18px",
          border: isDark ? "1px solid rgba(71, 85, 105, 0.9)" : "1px solid rgba(226, 232, 240, 0.95)",
          background: isDark ? "rgba(15,23,42,0.94)" : "rgba(255,255,255,0.96)",
          color: isDark ? "#e2e8f0" : "#0f172a",
          boxShadow: "0 24px 60px -34px rgba(15, 23, 42, 0.4)",
          backdropFilter: "blur(16px)",
        },
        success: {
          iconTheme: {
            primary: "#0f766e",
            secondary: "#ecfeff",
          },
        },
        error: {
          iconTheme: {
            primary: "#be123c",
            secondary: "#fff1f2",
          },
        },
      }}
    />
  );
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <AppToaster />
    </BrowserRouter>
  </React.StrictMode>,
);
