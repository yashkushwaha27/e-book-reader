import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

document.documentElement.style.setProperty(
  "--app-bg-image",
  `url(${import.meta.env.BASE_URL}background.avif)`,
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
