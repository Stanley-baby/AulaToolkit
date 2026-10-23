import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Flyout } from './Flyout';
import { Osd } from './Osd';
import './styles.css';

// The same bundle serves the main window and the tray hover flyout; the hash selects which.
const view = window.location.hash;
const isFlyout = view === '#flyout';
const isOsd = view === '#osd';
if (isFlyout || isOsd) document.body.style.background = 'transparent';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isOsd ? <Osd /> : isFlyout ? <Flyout /> : <App />}</React.StrictMode>,
);
