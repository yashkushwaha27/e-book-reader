import { createBrowserRouter, Outlet } from "react-router-dom";
import { AppLayout } from "../components/appLayout/AppLayout";
import { BookReaderPage } from "../pages/reader/BookReaderPage";
import { LandingPage } from "../pages/landing/LandingPage";
import { LibraryPage } from "../pages/library/LibraryPage";
import { TemplatesPage } from "../pages/templates/TemplatesPage";

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export const appRouter = createBrowserRouter(
  [
    {
      path: "/",
      element: (
        <AppLayout>
          <Outlet />
        </AppLayout>
      ),
      children: [
        { index: true, element: <LandingPage /> },
        { path: "library", element: <LibraryPage /> },
        { path: "templates", element: <TemplatesPage /> },
        { path: "read/:bookId", element: <BookReaderPage /> },
      ],
    },
  ],
  { basename: routerBasename },
);
