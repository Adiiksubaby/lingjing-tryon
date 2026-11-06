import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from './Dashboard';
import '@lingjing/shared/tokens.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Dashboard />
  </StrictMode>,
);
