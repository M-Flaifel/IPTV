import { ALL_CATEGORY } from '../types';
import type { Category } from '../types';
import './CategoryNav.css';

type CategoryStatus = 'loading' | 'ready' | 'error';

interface CategoryNavProps {
  categories: Category[];
  activeId: string | null;
  status: CategoryStatus;
  error: string | null;
  /** Sidebar heading; "Browse" for catalogs, "Seasons" for series detail. */
  title?: string;
  /** False for the seasons sidebar, which has no "All" entry. */
  showAll?: boolean;
  onSelect: (id: string) => void;
  onRetry: () => void;
}

export function CategoryNav({
  categories,
  activeId,
  status,
  error,
  title = 'Browse',
  showAll = true,
  onSelect,
  onRetry,
}: CategoryNavProps) {
  const filters = (showAll ? [ALL_CATEGORY] : []).concat(categories);
  const showLoading = status === 'loading' && categories.length === 0;
  const showError = status === 'error' && categories.length === 0;

  return (
    <nav class="categories" aria-label="Categories">
      <h2 class="categories__title">{title}</h2>

      {showLoading ? (
        <p class="categories__status" role="status">
          Loading categories…
        </p>
      ) : null}

      {showError ? (
        <div class="categories__status">
          <p role="alert">{error || 'Could not load categories.'}</p>
          <button
            type="button"
            class="categories__retry"
            data-spatial="sidebar"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      ) : null}

      {filters.length > 0 ? (
        <div class="categories__list">
          {filters.map((category) => {
            const active = category.id === activeId;

            return (
              <button
                type="button"
                class={
                  active
                    ? 'categories__item categories__item--active'
                    : 'categories__item'
                }
                data-spatial="sidebar"
                aria-pressed={active}
                onClick={() => onSelect(category.id)}
                key={category.id}
              >
                <span class="categories__name">{category.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}
