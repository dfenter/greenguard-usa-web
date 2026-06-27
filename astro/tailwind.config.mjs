/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Brand palette pulled from current static site
        bg: {
          DEFAULT: '#1a2e1f',
          dark: '#0a1a0d',
          card: '#0d1a10',
          panel: '#111c13',
        },
        accent: {
          DEFAULT: '#7dffaa',   // electric green
          muted: '#3d7a4f',
          deep: '#2d5a2d',
        },
        gold: {
          DEFAULT: '#c9a84c',
          light: '#e8d08a',
        },
        cream: {
          DEFAULT: '#d4e6ca',
          muted: 'rgba(212,230,202,0.7)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      maxWidth: {
        container: '1100px',
      },
    },
  },
  plugins: [],
};
