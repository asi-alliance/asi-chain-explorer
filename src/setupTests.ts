// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom has no TextEncoder, and react-router 7 needs it when its module loads.
if (typeof global.TextEncoder === 'undefined') {
  Object.assign(global, { TextEncoder: require('util').TextEncoder });
}
