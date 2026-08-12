import { APP_CONFIG } from '../appConfig';

interface SplashOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function SplashOverlay({ open, onClose }: SplashOverlayProps) {
  if (!open) return null;

  return (
    <div
      className="splash-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${APP_CONFIG.title} 소개`}
      onClick={onClose}
    >
      <div className="splash-overlay__panel" onClick={onClose}>
        <img className="splash-overlay__logo" src="/icon-136.png" alt="" />
        <div className="splash-overlay__content">
          <h2 className="splash-overlay__title">
            {APP_CONFIG.title}{' '}
            <span className="splash-overlay__version">
              v{APP_CONFIG.version}
              {APP_CONFIG.buildStamp ? ` (${APP_CONFIG.buildStamp})` : ''}
            </span>
          </h2>
          <a
            className="splash-overlay__url"
            href={APP_CONFIG.blogUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            {APP_CONFIG.blogUrl}
          </a>
        </div>
      </div>
    </div>
  );
}
