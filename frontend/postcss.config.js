import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Resolve autoprefixer from the actual location where it's installed
// to avoid workspace hoisting resolution conflicts
const tailwindcss = await import('tailwindcss').then(m => m.default);
const autoprefixer = await import('autoprefixer').then(m => m.default);

export default {
  plugins: [tailwindcss, autoprefixer],
};
