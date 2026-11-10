import { useState } from 'preact/hooks';
import type { XtreamConfig } from '../types';
import { normalizeBaseUrl } from '../services/config';

interface PlaylistFormProps {
  initial: XtreamConfig | null;
  onSave: (config: XtreamConfig) => void;
}

export function PlaylistForm({ initial, onSave }: PlaylistFormProps) {
  const [server, setServer] = useState(initial ? initial.baseUrl : '');
  const [username, setUsername] = useState(initial ? initial.username : '');
  const [password, setPassword] = useState(initial ? initial.password : '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const change = (setter: (value: string) => void, value: string) => {
    setSaved(false);
    setter(value);
  };

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
      setError(
        'Enter a valid server address, for example http://example.com:8080.'
      );
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

    setError(null);
    setSaved(true);
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
    const nextIndex = current + offset;

    // At the edges, let the arrow bubble to spatial navigation so remote users
    // can leave the form and reach the sections.
    if (nextIndex < 0 || nextIndex >= fields.length) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    fields[nextIndex].focus();
  };

  return (
    <form class="playlist__form" onSubmit={submit} onKeyDown={onKeyDown}>
      <label class="playlist__field">
        <span class="playlist__label">Server address</span>
        <input
          class="playlist__input"
          data-spatial="playlist"
          type="url"
          inputMode="url"
          autoComplete="url"
          spellcheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="http://example.com:8080"
          value={server}
          onInput={(event) => change(setServer, event.currentTarget.value)}
          autoFocus={!initial}
        />
      </label>

      <label class="playlist__field">
        <span class="playlist__label">Username</span>
        <input
          class="playlist__input"
          data-spatial="playlist"
          type="text"
          autoComplete="username"
          spellcheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={username}
          onInput={(event) => change(setUsername, event.currentTarget.value)}
        />
      </label>

      <label class="playlist__field">
        <span class="playlist__label">Password</span>
        <input
          class="playlist__input"
          data-spatial="playlist"
          type="password"
          autoComplete="current-password"
          value={password}
          onInput={(event) => change(setPassword, event.currentTarget.value)}
        />
      </label>

      {error ? (
        <p class="playlist__error" role="alert">
          {error}
        </p>
      ) : null}

      {saved ? (
        <p class="playlist__saved" role="status">
          Playlist saved on this device.
        </p>
      ) : null}

      <div class="playlist__actions">
        <button
          class="playlist__submit"
          data-spatial="playlist"
          type="submit"
        >
          Save playlist
        </button>
      </div>

      <p class="playlist__hint">
        Use the Up and Down arrows to move between fields.
      </p>
    </form>
  );
}
