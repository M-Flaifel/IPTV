import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

export type InputMode = 'Mouse' | 'Touch' | 'Keyboard';

export interface InputModeContextValue {
  mode: InputMode;
  setMode: (mode: InputMode) => void;
}

const InputModeContext = createContext<InputModeContextValue | null>(null);

const MODIFIER_KEYS = [
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'OS',
];

function detectInitialMode(): InputMode {
  if (window.matchMedia) {
    if (window.matchMedia('(pointer: coarse)').matches) {
      return 'Touch';
    }
  }

  return 'Mouse';
}

function toAttribute(mode: InputMode): string {
  return mode.toLowerCase();
}

export function InputModeProvider({ children }: { children: ComponentChildren }) {
  const [mode, setMode] = useState<InputMode>(detectInitialMode);

  useEffect(() => {
    document.documentElement.setAttribute('data-input-mode', toAttribute(mode));
  }, [mode]);

  useEffect(() => {
    let lastTouch = 0;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        setMode('Touch');
      } else {
        setMode('Mouse');
      }
    };

    const onTouchStart = () => {
      lastTouch = Date.now();
      setMode('Touch');
    };

    const onMouseDown = () => {
      // A tap can produce a compatibility mousedown after touchstart.
      if (Date.now() - lastTouch < 800) {
        return;
      }
      setMode('Mouse');
    };

    const onWheel = () => {
      setMode('Mouse');
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (MODIFIER_KEYS.indexOf(event.key) !== -1) {
        return;
      }
      setMode('Keyboard');
    };

    const hasPointerEvents = 'PointerEvent' in window;

    if (hasPointerEvents) {
      document.addEventListener('pointerdown', onPointerDown);
    } else {
      document.addEventListener('touchstart', onTouchStart, { passive: true });
      document.addEventListener('mousedown', onMouseDown);
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      if (hasPointerEvents) {
        document.removeEventListener('pointerdown', onPointerDown);
      } else {
        document.removeEventListener('touchstart', onTouchStart);
        document.removeEventListener('mousedown', onMouseDown);
      }

      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('wheel', onWheel);
    };
  }, []);

  const value = useMemo<InputModeContextValue>(
    () => ({ mode, setMode }),
    [mode]
  );

  return (
    <InputModeContext.Provider value={value}>
      {children}
    </InputModeContext.Provider>
  );
}

export function useInputMode(): InputModeContextValue {
  const value = useContext(InputModeContext);

  if (!value) {
    throw new Error('useInputMode must be used inside InputModeProvider');
  }

  return value;
}
