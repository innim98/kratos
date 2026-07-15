import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { installLogCapture } from './lib/logbuffer.js';

// Start capturing console output + uncaught errors before anything else renders,
// so on-device (mobile) debugging can retrieve them from the agent list.
installLogCapture();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
