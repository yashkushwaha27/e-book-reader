import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Slide, ToastContainer } from "react-toastify";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "react-toastify/dist/ReactToastify.css";
import "./index.css";

document.documentElement.style.setProperty(
  "--app-bg-image",
  `url(${import.meta.env.BASE_URL}background.avif)`,
);

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <>
      <App />
      <ToastContainer
        position="top-center"
        transition={Slide}
        autoClose={4500}
        newestOnTop
        closeOnClick
        draggable
        pauseOnHover
        pauseOnFocusLoss
        limit={5}
        theme="dark"
        className="app-toast-container"
        toastClassName="app-toast"
      />
    </>
  </StrictMode>,
);
