import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { ROUTES } from "../../routes/routes.constants";
import "./AppLayout.css";

type AppLayoutProps = {
  children: ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to={ROUTES.HOME} className="app-brand" end>
          Shelf &amp; Reader
        </NavLink>
        <nav className="app-nav" aria-label="Primary">
          <NavLink
            to={ROUTES.HOME}
            className={({ isActive }) =>
              isActive ? "app-nav-link is-active" : "app-nav-link"
            }
            end
          >
            Library
          </NavLink>
          <NavLink
            to={ROUTES.TEMPLATES}
            className={({ isActive }) =>
              isActive ? "app-nav-link is-active" : "app-nav-link"
            }
          >
            Templates
          </NavLink>
        </nav>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
