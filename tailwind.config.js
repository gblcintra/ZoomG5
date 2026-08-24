/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        ui:   ["'Space Grotesk'", 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'ui-monospace', 'Cascadia Code', 'monospace'],
      },
      colors: {
        bg:      '#07080c',
        surface: { DEFAULT: '#0e1118', hi: '#131720', hhi: '#181c28' },
        line:    { DEFAULT: '#1b2034', hi: '#252d44' },
        ink:     '#dde4f0',
        muted:   '#7d90b4',
        dim:     '#3d4d68',
        signal:  { DEFAULT: '#d03a18', hi: '#e04d2a' },
        live:    '#22c55e',
        warn:    '#f59e0b',
      },
      borderRadius: {
        xs: '4px', sm: '7px', md: '11px', lg: '16px',
      },
      boxShadow: {
        stomp:         '0 2px 0 #5e1607, 0 4px 18px rgba(208,58,24,0.35)',
        'stomp-press': '0 0px 0 #5e1607, 0 2px 6px rgba(208,58,24,0.2)',
        card:          '0 1px 4px rgba(0,0,0,.5)',
      },
      animation: {
        spin: 'spin 0.75s linear infinite',
      },
    },
  },
  plugins: [],
}
