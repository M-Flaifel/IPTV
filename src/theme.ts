export const THEMES = [
  'classic-guide',
  'paper-guide',
  'ember',
  'midnight-oled',
  'modern-glass',
  'high-contrast',
] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'classic-guide';

export const THEME_LABELS: Record<Theme, string> = {
  'classic-guide': 'Classic Guide',
  'paper-guide': 'Paper Guide',
  ember: 'Ember',
  'midnight-oled': 'Midnight OLED',
  'modern-glass': 'Modern Glass',
  'high-contrast': 'High Contrast',
};

const THEME_COLORS: Record<Theme, string> = {
  'classic-guide': '#0b1a2b',
  'paper-guide': '#f4efe4',
  ember: '#17100d',
  'midnight-oled': '#000000',
  'modern-glass': '#0f1420',
  'high-contrast': '#000000',
};

const STORAGE_KEY = 'iptv-theme';

export function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as readonly string[]).indexOf(value) !== -1;
}

export function getInitialTheme(): Theme {
  const fromDom = document.documentElement.getAttribute('data-theme');
  if (isTheme(fromDom)) {
    return fromDom;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) {
      return stored;
    }
  } catch (error) {
    // Storage can be unavailable in private mode or embedded webviews.
  }

  return DEFAULT_THEME;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', THEME_COLORS[theme]);
  }

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    // Non-fatal: the theme still applies for this session.
  }
}

export function nextTheme(theme: Theme): Theme {
  const index = THEMES.indexOf(theme);
  return THEMES[(index + 1) % THEMES.length];
}

export function previousTheme(theme: Theme): Theme {
  const index = THEMES.indexOf(theme);
  return THEMES[(index - 1 + THEMES.length) % THEMES.length];
}
