import { render } from 'preact';
import './styles/global.css';
import { InputModeProvider } from './context/InputModeContext';
import { App } from './app';

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
