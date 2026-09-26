import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import { App } from "./app/App";
import { initializeTheme, ThemeProvider } from "./app/theme";
import "./styles/global.css";

initializeTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider><App /></ThemeProvider>
  </StrictMode>,
);
