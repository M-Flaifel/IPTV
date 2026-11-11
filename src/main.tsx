import { render } from 'preact';
import './styles/global.css';
import { InputModeProvider } from './context/InputModeContext';
import { App } from './app';
import { registerTizenMediaKeys } from './services/tizenKeys';

// Media keys must be registered before they are ever pressed; Samsung's
// system layer otherwise consumes them and shows its own overlay.
registerTizenMediaKeys();

const root = document.getElementById('app');

if (!root) {
  throw new Error('Root element #app not found');
}

render(
  <InputModeProvider>
    <App />
  </InputModeProvider>,
  root
);
