import { useState } from 'preact/hooks';
import type { XtreamConfig } from '../types';
import { normalizeBaseUrl } from '../services/config';
import './SettingsScreen.css';

interface SettingsScreenProps {
  initial: XtreamConfig | null;
  canClose: boolean;
  onSave: (config: XtreamConfig) => void;
  onClose: () => void;
}

export function SettingsScreen({
  initial,
  canClose,
  onSave,
  onClose,
}: SettingsScreenProps) {
  const [server, setServer] = useState(initial ? initial.baseUrl : '');
  const [username, setUsername] = useState(initial ? initial.username : '');
  const [password, setPassword] = useState(initial ? initial.password : '');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: Event) => {
    event.preventDefault();

    const baseUrl = normalizeBaseUrl(server);

    if (!baseUrl) {
      setError('Enter your Xtream server address.');
      return;
    }

    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Unsupported protocol');
      }
    } catch (parseError) {
      setError('Enter a valid server address, for example http://example.com:8080.');
      return;
    }

    if (!username.trim()) {
      setError('Enter your username.');
      return;
    }

    if (!password) {
      setError('Enter your password.');
      return;
    }

    onSave({
      baseUrl,
      username: username.trim(),
      password,
    });
  };

  // Remotes have no Tab key. Up/Down moves between the form controls while
  // Left/Right stay available for editing the text inside an input.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }

    const form = event.currentTarget as HTMLFormElement;
    const fields = Array.prototype.slice.call(
      form.querySelectorAll<HTMLElement>('input, button')
    ) as HTMLElement[];

    const current = fields.indexOf(document.activeElement as HTMLElement);
    if (current === -1) {
      return;
    }

    const offset = event.key === 'ArrowDown' ? 1 : -1;
    const next = fields[(current + offset + fields.length) % fields.length];

    event.preventDefault();
    event.stopPropagation();
    next.focus();
  };

  return (
    <main class="settings">
      <div class="settings__panel">
        <header class="settings__header">
          <p class="settings__eyebrow">Flaifel's Entertainment</p>
          <h1 class="settings__title">Connect your IPTV account</h1>
          <p class="settings__intro">
            Enter the Xtream Codes details from your provider. They stay on
            this device.
          </p>
        </header>

        <form
          class="settings__form"
          onSubmit={submit}
          onKeyDown={onKeyDown}
        >
          <label class="settings__field">
            <span class="settings__label">Server address</span>
            <input
              class="settings__input"
              type="url"
              inputMode="url"
              autoComplete="url"
              spellcheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="http://example.com:8080"
              value={server}
              onInput={(event) => setServer(event.currentTarget.value)}
              autoFocus
            />
          </label>

          <label class="settings__field">
            <span class="settings__label">Username</span>
            <input
              class="settings__input"
              type="text"
              autoComplete="username"
              spellcheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={username}
              onInput={(event) => setUsername(event.currentTarget.value)}
            />
          </label>

          <label class="settings__field">
            <span class="settings__label">Password</span>
            <input
              class="settings__input"
              type="password"
              autoComplete="current-password"
              value={password}
              onInput={(event) => setPassword(event.currentTarget.value)}
            />
          </label>

          {error ? (
            <p class="settings__error" role="alert">
              {error}
            </p>
          ) : null}

          <div class="settings__actions">
            {canClose ? (
              <button
                class="settings__button settings__button--ghost"
                type="button"
                onClick={onClose}
              >
                Cancel
              </button>
            ) : null}
            <button class="settings__button settings__button--primary" type="submit">
              Save and connect
            </button>
          </div>

          <p class="settings__hint">
            Use the Up and Down arrows to move between fields.
          </p>
        </form>
      </div>
    </main>
  );
}
