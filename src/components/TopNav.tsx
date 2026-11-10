import type { Section, ViewTarget, XtreamConfig } from '../types';
import { ThemeToggle } from './ThemeToggle';
import './TopNav.css';

interface TopNavProps {
  active: ViewTarget;
  config: XtreamConfig | null;
  onNavigate: (target: ViewTarget) => void;
}

const LINKS: Array<{ id: Section; label: string }> = [
  { id: 'live', label: 'Live TV' },
  { id: 'movies', label: 'Movies' },
  { id: 'series', label: 'Series' },
];

export function TopNav({ active, config, onNavigate }: TopNavProps) {
  return (
    <header class="top-nav">
      <button
        type="button"
        class="top-nav__brand"
        data-spatial="nav"
        onClick={() => onNavigate('home')}
      >
        <span class="top-nav__mark" aria-hidden="true">
          F
        </span>
        <span class="top-nav__wordmark">
          Flaifel<span class="top-nav__dot">.</span>
        </span>
      </button>

      <nav class="top-nav__links" aria-label="Sections">
        <button
          type="button"
          class={
            active === 'home'
              ? 'top-nav__link top-nav__link--active'
              : 'top-nav__link'
          }
          data-spatial="nav"
          aria-current={active === 'home' ? 'page' : undefined}
          onClick={() => onNavigate('home')}
        >
          Home
        </button>

        {LINKS.map((link) => (
          <button
            type="button"
            class={
              active === link.id
                ? 'top-nav__link top-nav__link--active'
                : 'top-nav__link'
            }
            data-spatial="nav"
            aria-current={active === link.id ? 'page' : undefined}
            disabled={!config}
            onClick={() => onNavigate(link.id)}
            key={link.id}
          >
            {link.label}
          </button>
        ))}
      </nav>

      <div class="top-nav__end">
        <ThemeToggle />
      </div>
    </header>
  );
}
