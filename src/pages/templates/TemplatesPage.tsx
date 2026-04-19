import { Link } from "react-router-dom";
import { ROUTES } from "../../routes/routes.constants";
import "./TemplatesPage.css";

const templates = [
  {
    id: "classic",
    name: "Classic paper",
    description: "Warm paper, crisp ink. The default look of the reader chrome.",
    query: "",
  },
  {
    id: "sepia",
    name: "Sepia night",
    description: "Low-glare sepia page tint for longer sessions.",
    query: "?skin=sepia",
  },
  {
    id: "contrast",
    name: "High contrast",
    description: "Strong type and borders when lighting is uneven.",
    query: "?skin=contrast",
  },
] as const;

export function TemplatesPage() {
  return (
    <div className="templates">
      <header className="templates-header">
        <p className="templates-eyebrow">Appearance</p>
        <h1 className="templates-title">Reading templates</h1>
        <p className="templates-lede">
          Each preset opens the demo book with a different reader chrome. Use the query
          string on any <code className="inline-code">/read/…</code> URL the same way.
        </p>
        <p className="templates-lede">
          <Link className="templates-back" to={ROUTES.HOME}>
            ← Back to library
          </Link>
        </p>
      </header>

      <ul className="templates-grid">
        {templates.map((tpl) => (
          <li key={tpl.id}>
            <Link className="templates-card" to={`${ROUTES.read("demo-tale")}${tpl.query}`}>
              <span className={`templates-card-icon templates-card-icon--${tpl.id}`} aria-hidden />
              <h2 className="templates-card-title">{tpl.name}</h2>
              <p className="templates-card-desc">{tpl.description}</p>
              <span className="templates-card-cta">
                Preview
                <span className="templates-card-arrow" aria-hidden>
                  →
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="templates-drive" id="drive">
        <h2 className="templates-drive-title">Google Drive &amp; remote HTML</h2>
        <ol className="templates-drive-steps">
          <li>
            Upload an <code className="inline-code">.html</code> book to Drive and share
            it so you can fetch the file (link sharing is enough for the dev proxy).
          </li>
          <li>
            Copy the file id from a URL shaped like{" "}
            <code className="inline-code">
              https://drive.google.com/file/d/FILE_ID/view
            </code>
            .
          </li>
          <li>
            Add <code className="inline-code">gdriveFileId: &quot;…&quot;</code> to a row
            in <code className="inline-code">src/data/books.ts</code>. While{" "}
            <code className="inline-code">yarn dev</code> is running, Vite forwards{" "}
            <code className="inline-code">/api/gdrive-html?fileId=…</code> to Drive so the
            browser is not blocked by CORS.
          </li>
          <li>
            For a static production deploy, plan a tiny backend proxy or host HTML at a
            URL that already allows your site to fetch it.
          </li>
        </ol>
      </section>
    </div>
  );
}
