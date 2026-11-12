import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ConfigErrorScreen from './components/ConfigErrorScreen';
import { createApolloClient } from './apollo-client';
import { ConfigError, getPublicConfig } from './runtimeConfig';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

let content: React.ReactNode;
try {
  content = <App client={createApolloClient(getPublicConfig())} />;
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(error.message);
  content = <ConfigErrorScreen problems={error.problems} />;
}

root.render(<React.StrictMode>{content}</React.StrictMode>);
