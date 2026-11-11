import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Playlist, ViewTarget, XtreamConfig } from '../types';
import { SpatialNavigation } from '../hooks/useSpatialNavigation';
import { TopNav } from './TopNav';
import { PlaylistForm } from './PlaylistForm';
import type { PlaylistFormValues } from './PlaylistForm';
import { generatePlaylistId, playlistHost } from '../services/playlistStore';
import './PlaylistsScreen.css';

interface PlaylistsScreenProps {
  playlists: Playlist[];
  activeId: string | null;
  config: XtreamConfig | null;
  onActivate: (id: string) => void;
  onSave: (playlist: Playlist) => void;
  onDelete: (id: string) => void;
  onHome: () => void;
  onNavigate: (target: ViewTarget) => void;
}

type EditState =
  | { mode: 'new' }
  | { mode: 'edit'; playlist: Playlist }
  | null;

export function PlaylistsScreen({
  playlists,
  activeId,
  config,
  onActivate,
  onSave,
  onDelete,
  onHome,
  onNavigate,
}: PlaylistsScreenProps) {
  const [editing, setEditing] = useState<EditState>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Row to focus once the form closes and the list re-renders.
  const pendingRowFocus = useRef<string | null>(null);

  useLayoutEffect(() => {
    // The form focuses its own first field when it opens.
    if (editing) {
      return;
    }

    const content = contentRef.current;
    if (!content) {
      return;
    }

    // Keep focus when the focused control survived the change (for example
    // another row's button while a sibling was deleted).
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active.isConnected &&
      content.contains(active) &&
      active.hasAttribute('data-spatial')
    ) {
      return;
    }

    const savedId = pendingRowFocus.current;
    pendingRowFocus.current = null;

    const target = savedId
      ? content.querySelector(
          `[data-playlist-id="${savedId}"] [data-spatial]`
        )
      : null;

    if (target instanceof HTMLElement) {
      target.focus();
      return;
    }

    const first = content.querySelector('[data-spatial]');
    if (first instanceof HTMLElement) {
      first.focus();
    }
  }, [editing, playlists.length]);

  const closeForm = () => {
    setEditing(null);
  };

  const handleFormSave = (values: PlaylistFormValues) => {
    const playlist: Playlist =
      editing && editing.mode === 'edit'
        ? { ...editing.playlist, ...values }
        : { id: generatePlaylistId(), ...values };

    onSave(playlist);
    pendingRowFocus.current = playlist.id;
    setEditing(null);
  };

  const handleDelete = (playlist: Playlist) => {
    // Deleting credentials is destructive; the first press only arms the
    // button and stepping off it disarms it again.
    if (confirmDeleteId !== playlist.id) {
      setConfirmDeleteId(playlist.id);
      return;
    }

    setConfirmDeleteId(null);
    onDelete(playlist.id);
  };

  const isEditingExisting = editing !== null && editing.mode === 'edit';

  return (
    <main class="playlists">
      <SpatialNavigation onBack={editing ? closeForm : onHome} />
      <TopNav active="playlists" config={config} onNavigate={onNavigate} />

      <div class="playlists__body">
        <header class="playlists__header">
          <p class="playlists__eyebrow">Settings</p>
          <h1 class="playlists__title">
            {editing
              ? isEditingExisting
                ? 'Edit playlist'
                : 'Add playlist'
              : 'Playlists'}
          </h1>
          <p class="playlists__intro">
            {editing
              ? 'Credentials are checked against your Xtream server before anything is saved.'
              : 'Save as many playlists as you like. The active one feeds Live TV, Movies, and Series.'}
          </p>
        </header>

        <div class="playlists__content" ref={contentRef}>
          {editing ? (
            <PlaylistForm
              initial={isEditingExisting ? editing.playlist : null}
              onSave={handleFormSave}
              onCancel={closeForm}
            />
          ) : (
            <div class="playlists__list">
              {playlists.map((playlist) => {
                const active = playlist.id === activeId;
                const confirming = confirmDeleteId === playlist.id;

                return (
                  <div
                    class={
                      active
                        ? 'playlists__row playlists__row--active'
                        : 'playlists__row'
                    }
                    data-playlist-id={playlist.id}
                    key={playlist.id}
                  >
                    <button
                      type="button"
                      class="playlists__row-main"
                      data-spatial="playlists"
                      aria-label={`Use ${playlist.name}`}
                      onClick={() => onActivate(playlist.id)}
                    >
                      <span class="playlists__row-name">{playlist.name}</span>
                      <span class="playlists__row-meta">
                        {playlistHost(playlist)} · {playlist.username}
                      </span>
                      {active ? (
                        <span class="playlists__row-badge">Active</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      class="playlists__row-button"
                      data-spatial="playlists"
                      onClick={() => setEditing({ mode: 'edit', playlist })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      class={
                        confirming
                          ? 'playlists__row-button playlists__row-button--danger'
                          : 'playlists__row-button'
                      }
                      data-spatial="playlists"
                      aria-label={`Delete ${playlist.name}`}
                      onBlur={() => {
                        if (confirmDeleteId === playlist.id) {
                          setConfirmDeleteId(null);
                        }
                      }}
                      onClick={() => handleDelete(playlist)}
                    >
                      {confirming ? 'Sure?' : 'Delete'}
                    </button>
                  </div>
                );
              })}

              {playlists.length === 0 ? (
                <p class="playlists__empty">
                  No playlists saved yet. Add your first Xtream playlist to
                  start watching.
                </p>
              ) : null}

              <button
                type="button"
                class="playlists__add"
                data-spatial="playlists"
                onClick={() => setEditing({ mode: 'new' })}
              >
                Add playlist
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
