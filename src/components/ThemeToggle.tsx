import { useEffect, useState } from 'preact/hooks';
import {
  applyTheme,
  getInitialTheme,
  nextTheme,
  previousTheme,
  THEME_LABELS,
} from '../theme';
import type { Theme } from '../theme';
import { useInputMode } from '../context/InputModeContext';
import './ThemeToggle.css';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const { setMode } = useInputMode();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const currentLabel = THEME_LABELS[theme];
  const nextLabel = THEME_LABELS[nextTheme(theme)];

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    const forward = event.key === 'ArrowRight';

    event.preventDefault();
    // Keep the arrow from reaching the spatial navigation listener, so it
    // changes the theme instead of moving focus away from this control.
    event.stopPropagation();
    setMode('Keyboard');
    setTheme((current) =>
      forward ? nextTheme(current) : previousTheme(current)
    );
  };

  return (
    <>
      <button
        type="button"
        class="theme-toggle"
        data-spatial="header"
        aria-describedby="theme-toggle-help"
        onClick={() => setTheme(nextTheme(theme))}
        onKeyDown={onKeyDown}
      >
        <span class="theme-toggle__swatch" aria-hidden="true" />
        <span class="theme-toggle__text">
          <span class="theme-toggle__caption">Theme{' '}</span>
          <span class="theme-toggle__value" aria-live="polite">
            {currentLabel}
          </span>
        </span>
      </button>
      <span class="visually-hidden" id="theme-toggle-help">
        Left and Right arrows change the theme. Activate to switch to{' '}
        {nextLabel}.
      </span>
    </>
  );
}
