import './index.css';
import ReactDOM from "react-dom/client";
import React from 'react';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import ErrorBoundary from './components/Shared/ErrorBoundary.jsx';

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
