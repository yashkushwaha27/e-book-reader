import { Link } from "react-router-dom";
import { ROUTES } from "../../routes/routes.constants";
import "../library/LibraryPage.css";

export function LandingPage() {
  return (
    <div className="library library-landing">
      <section className="library-hero library-landing-hero">
        <p className="library-eyebrow">Digital shelf</p>
        <h1 className="library-title">Curated for immersive reading</h1>
        {/* <p className="library-sub library-landing-sub">
          <Link className="library-inline-link" to={ROUTES.TEMPLATES}>
            Templates &amp; remote sources
          </Link>
        </p> */}
        <div className="library-landing-actions">
          <Link to={ROUTES.LIBRARY} className="library-view-btn">
            View library
          </Link>
        </div>
      </section>
    </div>
  );
}
