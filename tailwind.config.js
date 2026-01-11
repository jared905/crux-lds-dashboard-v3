/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#121212',      // Deepest Grey (Canvas)
        surface: '#1E1E1E',         // Lighter Grey (Cards/Containers)
        surfaceHover: '#252525',    // Slight lift on hover
        primary: '#E0E0E0',         // High-readability Text
        secondary: '#9E9E9E',       // Muted Text
        accent: '#2962FF',          // Electric Blue (Action/Trends)
        danger: '#CF6679',          // Error/Negative Trends
        success: '#00C853',         // Positive Trends
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}