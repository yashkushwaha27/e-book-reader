import { RouterProvider } from "react-router-dom";
import { DesktopBlockPage } from "./components/desktopBlock/DesktopBlockPage";
import { useDesktopWebBlock } from "./hooks/useDesktopWebBlock";
import { appRouter } from "./routes/Router";

/** Viewports this wide or wider are treated as desktop web and see the block page. */
const DESKTOP_MIN_WIDTH_PX = 768;

function App() {
  const desktopBlocked = useDesktopWebBlock(DESKTOP_MIN_WIDTH_PX);
  if (desktopBlocked) return <DesktopBlockPage />;
  return <RouterProvider router={appRouter} />;
}

export default App;
