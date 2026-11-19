import React from 'react';

/** Shown instead of the explorer when its public endpoints are missing or invalid. */
const ConfigErrorScreen: React.FC<{ problems: string[] }> = ({ problems }) => (
  <main role="alert" style={{ maxWidth: 720, margin: '4rem auto', padding: '0 1rem', fontFamily: 'sans-serif' }}>
    <h1>Explorer configuration error</h1>
    <p>The explorer has no valid data endpoint, so it does not connect to any service.</p>
    <ul>
      {problems.map(problem => (
        <li key={problem}>{problem}</li>
      ))}
    </ul>
  </main>
);

export default ConfigErrorScreen;
