import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Playlist } from '../types';
import { checkCredentials } from '../services/xtream';
import { normalizeBaseUrl } from '../services/config';
import './PlaylistForm.css';

export interface PlaylistFormValues {
  name: string;
  baseUrl: string;
  username: string;
  password: string;
}

interface PlaylistFormProps {
  /** Null adds a new playlist; a playlist object edits it. */
  initial: Playlist | null;
  /** Called only after the credential check passes. */
  onSave: (values: PlaylistFormValues) => void;
  onCancel: () => void;
}

type FieldKey = 'name' | 'baseUrl' | 'username' | 'password';

const FIELD_ORDER: FieldKey[] = ['name', 'baseUrl', 'username', 'password'];

const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Playlist name',
  baseUrl: 'Server address',
  username: 'Username',
  password: 'Password',
};

const FIELD_PLACEHOLDERS: Record<FieldKey, string> = {
  name: 'For example Family TV',
  baseUrl: 'http://example.com:8080',
  username: 'Your username',
  password: 'Your password',
};

const PASSWORD_DOTS = '••••••••••••';

const EYE_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.6" />
  </svg>
);

const EYE_OFF_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M2 12s3.5-6 10-6c2.2 0 4 .8 5.5 1.8M22 12s-3.5 6-10 6c-2.2 0-4-.8-5.5-1.8" />
    <path d="M4 4l16 16" />
  </svg>
);

const EMPTY_VALUES: PlaylistFormValues = {
  name: '',
  baseUrl: '',
  username: '',
  password: '',
};

export function PlaylistForm({ initial, onSave, onCancel }: PlaylistFormProps) {
  const [values, setValues] = useState<PlaylistFormValues>(
    initial
      ? {
          name: initial.name,
          baseUrl: initial.baseUrl,
          username: initial.username,
          password: initial.password,
        }
      : EMPTY_VALUES
  );
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirrors of state for the input key handler, which does not re-bind.
  const editingRef = useRef<FieldKey | null>(null);
  editingRef.current = editing;

  const buttonRefs = useRef<Partial<Record<FieldKey, HTMLButtonElement | null>>>(
    {}
  );
  const submitRef = useRef<HTMLButtonElement>(null);
  // Focus promised to a control that does not exist yet: the same field's
  // button after an Escape or an arrow at the edges. The button's ref
  // callback claims it as soon as it re-renders.
  const pendingFocus = useRef<FieldKey | 'submit' | null>(null);

  useLayoutEffect(() => {
    // The form owns the screen's focus when it opens.
    buttonRefs.current.name?.focus();
  }, []);

  // Focus and select a field's input the instant it is committed to the DOM.
  // A deferred effect leaves a window where the input is visible but not yet
  // focused, so a fast following keypress — remote key repeat, or automated
  // checks — lands on <body> and escapes the form. select() makes retyping a
  // value a single press on the remote. The callback identity is stable, so
  // re-renders (typing) do not re-run it and steal the selection.
  const takeInputRef = useCallback((element: HTMLInputElement | null) => {
    if (element) {
      element.focus();
      element.select();
    }
  }, []);

  /**
   * Closes the edit; the value is already synced live by onInput.
   *
   * Focus is handed over immediately when the target control already exists
   * in the DOM (the submit button, and every field button that is not being
   * edited). Waiting for a post-render effect instead leaves a gap after the
   * input unmounts where focus falls to <body>, so a fast following keypress
   * — remote key repeat, or automated checks — hits nothing and the intended
   * control is never activated.
   */
  const commit = (focusTarget: FieldKey | 'submit' | null) => {
    pendingFocus.current = focusTarget;

    if (focusTarget === 'submit') {
      submitRef.current?.focus();
    } else if (focusTarget && buttonRefs.current[focusTarget]) {
      buttonRefs.current[focusTarget]?.focus();
    }

    setEditing(null);
  };

  const startEdit = (field: FieldKey) => {
    setError(null);
    setEditing(field);
  };

  const onInputKeyDown = (field: FieldKey) => (event: KeyboardEvent) => {
    // Enter commits and moves to the next control.
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const index = FIELD_ORDER.indexOf(field);
      commit(index + 1 < FIELD_ORDER.length ? FIELD_ORDER[index + 1] : 'submit');
      return;
    }

    // Up/Down move between the fields; at the edges they stay, so the edit
    // never leaks focus into the page while the on-screen keyboard is up.
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      const index =
        FIELD_ORDER.indexOf(field) + (event.key === 'ArrowDown' ? 1 : -1);
      const bounded = Math.max(0, Math.min(FIELD_ORDER.length - 1, index));
      commit(FIELD_ORDER[bounded]);
      return;
    }

    // Back cancels the edit and keeps the user on this field's button.
    if (event.key === 'Escape' || event.keyCode === 10009) {
      event.preventDefault();
      event.stopPropagation();
      commit(field);
    }
  };

  const onInputBlur = (field: FieldKey) => () => {
    // A genuine focus move (mouse click elsewhere); just close the edit.
    if (editingRef.current === field) {
      commit(null);
    }
  };

  const renderControl = (field: FieldKey) => {
    const labelId = `playlist-field-${field}`;
    const value = values[field];
    const isEditing = editing === field;

    let display = value;
    const hiddenPassword = field === 'password' && !passwordVisible;
    if (hiddenPassword) {
      display = value ? PASSWORD_DOTS : '';
    }

    return (
      <div class="playlist__control">
        {isEditing ? (
          <input
            ref={takeInputRef}
            class="playlist__input"
            data-spatial="playlist"
            aria-labelledby={labelId}
            // Preact's JSX types discriminate <input> on `type`, so the union
            // 'password' | 'text' is narrowed to keep the checker happy; the
            // real value at runtime is text whenever the password is shown.
            type={(hiddenPassword ? 'password' : 'text') as 'password'}
            inputMode={field === 'baseUrl' ? 'url' : undefined}
            autoComplete={
              field === 'username'
                ? 'username'
                : field === 'password'
                  ? 'current-password'
                  : 'off'
            }
            spellcheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={FIELD_PLACEHOLDERS[field]}
            value={value}
            onInput={(event) => {
              const next = event.currentTarget.value;
              setValues((current) => ({ ...current, [field]: next }));
            }}
            onKeyDown={onInputKeyDown(field)}
            onBlur={onInputBlur(field)}
          />
        ) : (
          <button
            type="button"
            class="playlist__field-button"
            data-spatial="playlist"
            ref={(element) => {
              buttonRefs.current[field] = element;

              // Same-field commits (Escape, arrows at the edges) promise the
              // focus to a button that only exists after the re-render; take
              // it as soon as the button mounts so no keypress lands on
              // <body> while the field settles.
              if (element && pendingFocus.current === field) {
                pendingFocus.current = null;
                element.focus();
              }
            }}
            aria-labelledby={labelId}
            onClick={() => startEdit(field)}
          >
            <span
              class={
                display
                  ? 'playlist__field-value'
                  : 'playlist__field-value playlist__field-value--empty'
              }
            >
              {display || FIELD_PLACEHOLDERS[field]}
            </span>
            <span class="playlist__field-action" aria-hidden="true">
              Edit
            </span>
          </button>
        )}

        {field === 'password' ? (
          <button
            type="button"
            class="playlist__eye"
            data-spatial="playlist"
            aria-label={passwordVisible ? 'Hide password' : 'Show password'}
            aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible((visible) => !visible)}
          >
            {passwordVisible ? EYE_OFF_ICON : EYE_ICON}
          </button>
        ) : null}
      </div>
    );
  };

  const submit = async (event: Event) => {
    event.preventDefault();

    if (checking) {
      return;
    }

    const name = values.name.trim();
    const baseUrl = normalizeBaseUrl(values.baseUrl);
    const username = values.username.trim();
    const password = values.password;

    if (!name) {
      setError('Enter a name for this playlist.');
      return;
    }

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

    if (!username) {
      setError('Enter your username.');
      return;
    }

    if (!password) {
      setError('Enter your password.');
      return;
    }

    setError(null);
    setChecking(true);

    const result = await checkCredentials({ baseUrl, username, password });

    setChecking(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    onSave({ name, baseUrl, username, password });
  };

  return (
    <form
      class="playlist__form"
      data-spatial-scope="playlist-form"
      onSubmit={submit}
    >
      {FIELD_ORDER.map((field) => (
        <div class="playlist__field" key={field}>
          <span class="playlist__label" id={`playlist-field-${field}`}>
            {FIELD_LABELS[field]}
          </span>
          {renderControl(field)}
        </div>
      ))}

      {error ? (
        <p class="playlist__error" role="alert">
          {error}
        </p>
      ) : null}

      {checking ? (
        <p class="playlist__status" role="status">
          Checking your credentials…
        </p>
      ) : null}

      <div class="playlist__actions">
        <button
          type="button"
          class="playlist__cancel"
          data-spatial="playlist"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          ref={submitRef}
          type="submit"
          class="playlist__submit"
          data-spatial="playlist"
          disabled={checking}
        >
          {checking ? 'Checking…' : initial ? 'Save changes' : 'Save playlist'}
        </button>
      </div>

      <p class="playlist__hint">
        Press Enter to edit a field. Up and Down move between fields.
      </p>
    </form>
  );
}
