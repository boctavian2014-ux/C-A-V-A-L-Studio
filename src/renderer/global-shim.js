/** Node/webpack polyfill for browser globals (Monaco, some deps expect `global`). */
window.global = globalThis;
