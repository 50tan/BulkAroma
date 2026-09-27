/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './frontend/index.html',
    './frontend/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9f7',
          100: '#d1ede7',
          200: '#a3dbd0',
          300: '#6cc4b4',
          400: '#3ea899',
          500: '#2a8a7c',
          600: '#1e6d61',
          700: '#175349',
          800: '#123d36',
          900: '#0c2925',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
