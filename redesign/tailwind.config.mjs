/** @type {import('tailwindcss').Config} */
// "Quiet Luxury Garden" palette — see DESIGN_BRIEF.md. Foundation lane owns this file.
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        ivory: '#FAF7F1',      // page base, warm gallery white
        linen: '#F2EDE3',      // alternate section base
        ink: '#1E2B23',        // primary text, botanical green-black
        pine: '#2E4A3B',       // brand green (headers, buttons)
        sage: '#7C9885',       // muted midtone, decorative only on light
        moss: '#4A6B57',       // hover / depth / secondary text on light
        brass: {
          DEFAULT: '#B08D4C',  // luxury accent: rules, icons, labels on dark
          ink: '#7E612B',      // AA-safe brass for eyebrow text on light bg
        },
        champagne: '#E5D5B0',  // soft accent tint (on dark)
        night: '#14201A',      // evening-garden dark sections
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      maxWidth: {
        container: '1200px',
      },
      borderRadius: {
        frame: '24px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,32,26,.06), 0 12px 40px -12px rgba(20,32,26,.12)',
        bloom: '0 2px 6px rgba(20,32,26,.10), 0 16px 48px -12px rgba(46,74,59,.35)',
      },
    },
  },
  plugins: [],
};
