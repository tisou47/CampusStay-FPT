import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'

// Browser globals the app uses (the `globals` package is not a dependency of this project).
const browser = Object.fromEntries(
  [
    'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'console',
    'fetch', 'Response', 'Request', 'Headers', 'URL', 'URLSearchParams', 'FormData', 'Blob', 'File', 'FileReader',
    'AbortController', 'Event', 'CustomEvent', 'PopStateEvent', 'KeyboardEvent', 'HTMLElement', 'Node',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
    'queueMicrotask', 'structuredClone', 'getComputedStyle', 'matchMedia', 'performance', 'crypto', 'atob', 'btoa',
    'Intl', 'TextEncoder', 'TextDecoder', 'Image', 'DOMParser', 'ResizeObserver', 'IntersectionObserver',
    'MutationObserver', 'alert', 'confirm', 'prompt', 'open', 'print', 'scrollTo', 'innerWidth', 'innerHeight',
  ].map((name) => [name, 'readonly']),
)

export default [
  { ignores: ['dist/**'] },
  js.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: browser,
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Without eslint-plugin-react, JSX use of a component is invisible to no-unused-vars: capitalised names
      // (components, icons) are left out; everything else must be used.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]', ignoreRestSiblings: true }],
      // `role` on a component (<RequireRole role="student">) is a prop, not an ARIA role.
      'jsx-a11y/aria-role': ['error', { ignoreNonDOM: true }],
    },
  },
]
