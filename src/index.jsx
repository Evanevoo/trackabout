import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './tailwind.css';
import { ThemeContextProvider } from './context/ThemeContext';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <ThemeContextProvider>
    <App />
  </ThemeContextProvider>
); 