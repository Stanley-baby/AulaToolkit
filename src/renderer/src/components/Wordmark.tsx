// The "AULA Toolkit" wordmark: a heavy "AULA" and a lighter "Toolkit" in the logo's ember gradient.
// Text rather than an image, so it uses the app font and follows the theme. Pass `logo` to show the
// hexagon mark in front of it.
import logoSrc from '../assets/logo.svg';

export const Wordmark = ({ size = 16, logo = false, className = '' }: { size?: number; logo?: boolean; className?: string }) => (
  <span className={`inline-flex items-center select-none whitespace-nowrap ${className}`} style={{ gap: size * 0.45, fontSize: size, lineHeight: 1 }} aria-label="AULA Toolkit">
    {logo && <img src={logoSrc} alt="" draggable={false} style={{ height: size * 1.55, width: size * 1.55 }} />}
    <span>
      <span style={{ fontWeight: 800, letterSpacing: '0.02em' }}>AULA</span>
      <span
        style={{
          fontWeight: 600,
          marginLeft: '0.24em',
          backgroundImage: 'linear-gradient(90deg, #ff9a3d, #ff5a1f 55%, #ff2f6d)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        Toolkit
      </span>
    </span>
  </span>
);
