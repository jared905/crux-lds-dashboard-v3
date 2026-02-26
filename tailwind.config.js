/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#181817',
        surface: '#1E1E1E',
        surfaceHover: '#252525',
        primary: '#E0E0E0',
        secondary: '#9E9E9E',
        accent: '#2962FF',
        danger: '#CF6679',
        success: '#00C853',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Barlow Condensed', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}