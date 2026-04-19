import { createBrowserRouter, Outlet } from "react-router-dom";
import { AppLayout } from "../components/appLayout/AppLayout";
import { BookReaderPage } from "../pages/reader/BookReaderPage";
import { LibraryPage } from "../pages/library/LibraryPage";
import { TemplatesPage } from "../pages/templates/TemplatesPage";

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: (
      <AppLayout>
        <Outlet />
      </AppLayout>
    ),
    children: [
      { index: true, element: <LibraryPage /> },
      { path: "templates", element: <TemplatesPage /> },
      { path: "read/:bookId", element: <BookReaderPage /> },
    ],
  },
]);
