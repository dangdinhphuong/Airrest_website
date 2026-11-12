import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ConfigError from './components/ConfigError';
import { api } from './lib/api';
import './styles.css';
import './user-reset.css';
import './user.css';
import './forms.css';

createRoot(document.getElementById('root')).render(<React.StrictMode>{api ? <App /> : <ConfigError />}</React.StrictMode>);
