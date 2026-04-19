import "./DesktopBlockPage.css";

export function DesktopBlockPage() {
  return (
    <div className="desktop-block">
      <div className="desktop-block-panel" role="alert">
        <p className="desktop-block-eyebrow">Digital shelf</p>
        <h1 className="desktop-block-title">Mobile only</h1>
        <p className="desktop-block-body">
          This reader is built for phones and small tablets. Open this address on a mobile device to
          browse your library and read with the page-flip layout.
        </p>
        <p className="desktop-block-hint">If you’re already on a phone, try rotating to portrait or zooming out.</p>
      </div>
    </div>
  );
}
