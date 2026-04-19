import { NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { ROUTES } from "../../routes/routes.constants";
import "./AppLayout.css";

type AppLayoutProps = {
  children: ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
  const { pathname } = useLocation();
  const isLanding = pathname === ROUTES.HOME;

  return (
    <div className={`app-shell${isLanding ? " app-shell--landing" : ""}`}>
      {!isLanding ? (
        <header className="app-header">
          <NavLink to={ROUTES.HOME} className="app-brand app-brand--digital-shelf" end>
            Digital shelf
          </NavLink>
          {/* <nav className="app-nav" aria-label="Primary">
          <NavLink
            to={ROUTES.LIBRARY}
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
        </nav> */}
        </header>
      ) : null}
      <main className={`app-main${isLanding ? " app-main--landing" : ""}`}>{children}</main>
    </div>
  );
}
