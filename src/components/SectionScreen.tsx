import { useLayoutEffect, useRef } from 'preact/hooks';
import type { Section, ViewTarget, XtreamConfig } from '../types';
import { SpatialNavigation } from '../hooks/useSpatialNavigation';
import { TopNav } from './TopNav';
import './SectionScreen.css';

interface SectionScreenProps {
  section: Exclude<Section, 'live'>;
  config: XtreamConfig | null;
  onHome: () => void;
  onNavigate: (target: ViewTarget) => void;
}

const SECTION_COPY = {
  movies: {
    title: 'Movies',
    mark: 'FILM',
    message:
      "This section isn't connected to Xtream's movie catalog yet. Your playlist is saved — use Live TV to browse channels.",
  },
  series: {
    title: 'Series',
    mark: 'SHOW',
    message:
      "This section isn't connected to Xtream's series catalog yet. Your playlist is saved — use Live TV to browse channels.",
  },
} as const;

export function SectionScreen({
  section,
  config,
  onHome,
  onNavigate,
}: SectionScreenProps) {
  const copy = SECTION_COPY[section];
  const backRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    backRef.current?.focus();
  }, []);

  return (
    <main class={`section-screen section-screen--${section}`}>
      <SpatialNavigation onBack={onHome} />
      <TopNav active={section} config={config} onNavigate={onNavigate} />

      <section class="section-screen__hero" aria-labelledby="section-title">
        <span class="section-screen__mark" aria-hidden="true">
          {copy.mark}
        </span>

        <div class="section-screen__inner">
          <p class="section-screen__eyebrow">Flaifel's Entertainment</p>
          <h1 class="section-screen__title" id="section-title">
            {copy.title}
          </h1>
          <p class="section-screen__message">{copy.message}</p>

          <div class="section-screen__actions">
            <button
              ref={backRef}
              type="button"
              class="section-screen__button"
              data-spatial="section"
              onClick={onHome}
            >
              Back to home
            </button>
            <button
              type="button"
              class="section-screen__button section-screen__button--ghost"
              data-spatial="section"
              onClick={() => onNavigate('live')}
            >
              Browse Live TV
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
