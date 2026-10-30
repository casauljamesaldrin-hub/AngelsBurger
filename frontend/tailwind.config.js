/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: '#20201e', ketchup: '#b8321f', bun: '#d9962b', pickle: '#4f7a3a', board: '#f2f3f1', line: '#dcdcd6' },
      fontFamily: { sans: ['Figtree', 'system-ui', 'sans-serif'], display: ['"Bricolage Grotesque"', 'Figtree', 'sans-serif'] },
    },
  },
  plugins: [],
};
