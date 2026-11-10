import { useCallback, useEffect, useState } from 'preact/hooks';
import { useInputMode } from '../context/InputModeContext';

type Direction = 'up' | 'down' | 'left' | 'right';

export interface SpatialPosition {
  group: string | null;
  x: number;
  y: number;
}

const SPATIAL_SELECTOR = '[data-spatial]';
const ROW_TOLERANCE = 8;
const EDGE_PADDING = 8;

const ARROW_KEYS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const ARROW_KEY_CODES: Record<number, Direction> = {
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
};

const BACK_KEY_CODES = [8, 27, 10009];

function isBackEvent(event: KeyboardEvent): boolean {
  if (
    event.key === 'Escape' ||
    event.key === 'Backspace' ||
    event.key === 'BrowserBack'
  ) {
    return true;
  }

  // Samsung/Tizen remotes send Back as key code 10009.
  return BACK_KEY_CODES.indexOf(event.keyCode) !== -1;
}

function findCategoryReturnTarget(): HTMLElement | null {
  const active = document.querySelector(
    '[data-spatial="sidebar"][aria-pressed="true"]'
  );
  if (active instanceof HTMLElement) {
    return active;
  }

  const first = document.querySelector('[data-spatial="sidebar"]');
  return first instanceof HTMLElement ? first : null;
}

function directionFromEvent(event: KeyboardEvent): Direction | null {
  const fromKey = ARROW_KEYS[event.key];
  if (fromKey) {
    return fromKey;
  }

  // Older TV remote stacks can send arrows without a modern `key` value.
  return ARROW_KEY_CODES[event.keyCode] || null;
}

function getSpatialElements(): HTMLElement[] {
  const nodes = document.querySelectorAll(SPATIAL_SELECTOR);
  const elements: HTMLElement[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const element = nodes[i] as HTMLElement;

    if (element.hasAttribute('disabled')) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      elements.push(element);
    }
  }

  return elements;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

function centerX(rect: DOMRect): number {
  return rect.left + rect.width / 2;
}

function centerY(rect: DOMRect): number {
  return rect.top + rect.height / 2;
}

function groupElements(elements: HTMLElement[]): Record<string, HTMLElement[]> {
  const groups: Record<string, HTMLElement[]> = {};

  for (let i = 0; i < elements.length; i++) {
    const group = elements[i].getAttribute('data-spatial');
    if (!group) {
      continue;
    }

    if (!groups[group]) {
      groups[group] = [];
    }

    groups[group].push(elements[i]);
  }

  return groups;
}

function commonContainer(members: HTMLElement[]): HTMLElement | null {
  let candidate = members[0].parentElement;

  while (candidate) {
    let containsAll = true;

    for (let i = 1; i < members.length; i++) {
      if (!candidate.contains(members[i])) {
        containsAll = false;
        break;
      }
    }

    if (containsAll) {
      return candidate;
    }

    candidate = candidate.parentElement;
  }

  return null;
}

/**
 * Which axis separates two focus groups? Desktop sidebar vs grid is horizontal;
 * the mobile bottom bar vs grid is vertical. Returns null when they overlap.
 */
function groupGapAxis(a: DOMRect, b: DOMRect): 'horizontal' | 'vertical' | null {
  const gapX = Math.max(a.left - b.right, b.left - a.right);
  const gapY = Math.max(a.top - b.bottom, b.top - a.bottom);

  if (gapX >= gapY && gapX > 0) {
    return 'horizontal';
  }

  if (gapY > 0) {
    return 'vertical';
  }

  return null;
}

function findNext(
  current: HTMLElement,
  direction: Direction,
  elements: HTMLElement[]
): HTMLElement | null {
  const currentRect = current.getBoundingClientRect();
  const currentX = centerX(currentRect);
  const currentY = centerY(currentRect);

  const groups = groupElements(elements);
  const currentGroup = current.getAttribute('data-spatial');
  const containerCache = new Map<string, DOMRect | null>();

  const containerFor = (group: string | null): DOMRect | null => {
    if (!group) {
      return null;
    }

    if (containerCache.has(group)) {
      return containerCache.get(group) || null;
    }

    const members = groups[group];
    const container =
      members && members.length > 0 ? commonContainer(members) : null;
    const rect = container ? container.getBoundingClientRect() : null;
    containerCache.set(group, rect);
    return rect;
  };

  const currentContainer = containerFor(currentGroup);

  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < elements.length; i++) {
    const candidate = elements[i];
    if (candidate === current) {
      continue;
    }

    const rect = candidate.getBoundingClientRect();
    const dx = centerX(rect) - currentX;
    const dy = centerY(rect) - currentY;

    const candidateGroup = candidate.getAttribute('data-spatial');

    if (candidateGroup && candidateGroup !== currentGroup) {
      const candidateContainer = containerFor(candidateGroup);

      if (currentContainer && candidateContainer) {
        const axis = groupGapAxis(currentContainer, candidateContainer);

        // Cross-group movement only follows the axis that separates the two
        // groups: Left/Right on desktop, Up/Down on the mobile bottom bar.
        if (
          axis === 'horizontal' &&
          direction !== 'left' &&
          direction !== 'right'
        ) {
          continue;
        }

        if (
          axis === 'vertical' &&
          direction !== 'up' &&
          direction !== 'down'
        ) {
          continue;
        }
      }
    }

    let primary: number;
    let secondary: number;

    if (direction === 'left') {
      if (dx > -1) {
        continue;
      }
      primary = -dx;
      secondary = Math.abs(dy);
    } else if (direction === 'right') {
      if (dx < 1) {
        continue;
      }
      primary = dx;
      secondary = Math.abs(dy);
    } else if (direction === 'up') {
      if (dy > -1) {
        continue;
      }
      primary = -dy;
      secondary = Math.abs(dx);
    } else {
      if (dy < 1) {
        continue;
      }
      primary = dy;
      secondary = Math.abs(dx);
    }

    // Prefer the nearest element on the arrow's axis while still allowing
    // slightly offset targets in the same row or column.
    const score = primary + secondary * 2;

    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function positionOf(
  target: HTMLElement,
  elements: HTMLElement[]
): SpatialPosition | null {
  const group = target.getAttribute('data-spatial');
  if (!group) {
    return null;
  }

  const peers = elements.filter(
    (element) => element.getAttribute('data-spatial') === group
  );

  const items = peers
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

  const rows: Array<Array<{ element: HTMLElement; rect: DOMRect }>> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const row = rows[rows.length - 1];

    if (row && Math.abs(row[0].rect.top - item.rect.top) <= ROW_TOLERANCE) {
      row.push(item);
    } else {
      rows.push([item]);
    }
  }

  for (let y = 0; y < rows.length; y++) {
    const row = rows[y].sort((a, b) => a.rect.left - b.rect.left);
    const x = row.findIndex((item) => item.element === target);

    if (x !== -1) {
      return { group, x, y };
    }
  }

  return null;
}

function ensureVisible(element: HTMLElement): void {
  let parent = element.parentElement;

  while (parent) {
    const style = getComputedStyle(parent);
    const scrollsY =
      /(auto|scroll)/.test(style.overflowY) &&
      parent.scrollHeight > parent.clientHeight + 1;

    if (scrollsY) {
      const elementRect = element.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();

      if (elementRect.top < parentRect.top + EDGE_PADDING) {
        parent.scrollTop -= parentRect.top + EDGE_PADDING - elementRect.top;
      } else if (elementRect.bottom > parentRect.bottom - EDGE_PADDING) {
        parent.scrollTop +=
          elementRect.bottom - (parentRect.bottom - EDGE_PADDING);
      }

      return;
    }

    parent = parent.parentElement;
  }
}

function isSpatial(element: EventTarget | null): element is HTMLElement {
  return element instanceof HTMLElement && element.hasAttribute('data-spatial');
}

export function useSpatialNavigation(
  onBack?: () => void
): SpatialPosition {
  const { setMode } = useInputMode();
  const [position, setPosition] = useState<SpatialPosition>({
    group: null,
    x: -1,
    y: -1,
  });

  const track = useCallback((element: HTMLElement) => {
    const next = positionOf(element, getSpatialElements());
    if (next) {
      setPosition(next);
    }
  }, []);

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (isSpatial(target)) {
        track(target);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const direction = directionFromEvent(event);

      // Back from the channel grid returns to the active category, which is
      // where the user came from. Back anywhere else leaves the browser.
      if (isBackEvent(event)) {
        // Backspace edits text instead of navigating while an input is focused.
        if (isTypingTarget(event.target)) {
          return;
        }

        const focused = document.activeElement;

        if (
          isSpatial(focused) &&
          focused.getAttribute('data-spatial') === 'channels'
        ) {
          const target = findCategoryReturnTarget();

          if (target) {
            event.preventDefault();
            document.documentElement.setAttribute('data-input-mode', 'keyboard');
            setMode('Keyboard');
            ensureVisible(target);
            target.focus();
            return;
          }
        }

        if (onBack) {
          event.preventDefault();
          onBack();
        }

        return;
      }

      if (!direction) {
        return;
      }

      if (isTypingTarget(event.target)) {
        // Single-line inputs use Up/Down for spatial movement at the form
        // edges; the form handles movement between its own fields.
        if (
          !(event.target instanceof HTMLInputElement) ||
          (direction !== 'up' && direction !== 'down')
        ) {
          return;
        }
      }

      const elements = getSpatialElements();
      if (elements.length === 0) {
        return;
      }

      const active = document.activeElement;
      const current = isSpatial(active) ? active : null;

      event.preventDefault();

      // Apply the mode synchronously so the focus ring is painted with this
      // keypress, even before Preact flushes the provider's effect.
      document.documentElement.setAttribute('data-input-mode', 'keyboard');
      setMode('Keyboard');

      const next = current
        ? findNext(current, direction, elements)
        : elements[0];

      if (!next) {
        return;
      }

      // Scroll first. If the target is already visible, focus() will not do
      // its own jumpy centering scroll (and Chromium 56 has no preventScroll).
      ensureVisible(next);
      next.focus();
      // The synchronous focusin listener updates the x/y position.
    };

    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [setMode, track, onBack]);

  return position;
}

/**
 * Isolated driver so focus movement does not re-render the app shell.
 */
export function SpatialNavigation({ onBack }: { onBack?: () => void }) {
  useSpatialNavigation(onBack);
  return null;
}

