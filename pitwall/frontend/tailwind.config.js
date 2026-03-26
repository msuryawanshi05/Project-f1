/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        pitwall: {
          bg:      '#0A0A0A',
          surface: '#111111',
          border:  '#222222',
          muted:   '#333333',
          text:    '#E5E5E5',
          dim:     '#888888',
          ghost:   '#444444',
        },
        sector: {
          purple: '#B468FF',
          green:  '#00D2BE',
          yellow: '#FFF200',
          white:  '#FFFFFF',
        },
        status: {
          green:  '#00A651',
          yellow: '#FFF200',
          red:    '#E8002D',
          sc:     '#FFA500',
          vsc:    '#FFD700',
        },
        popup: {
          critical: '#E8002D',
          high:     '#FF6B00',
          medium:   '#B468FF',
          info:     '#888888',
          blue:     '#3671C6',
          teal:     '#00D2BE',
        },
      },
      fontFamily: {
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['Barlow Condensed', 'Arial Narrow', 'sans-serif'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        timing: ['13px', { lineHeight: '1.2', letterSpacing: '0.02em' }],
      },
      keyframes: {
        ticker: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        pulse_dot: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.3' },
        },
        countdown_tick: {
          '0%':   { opacity: '1', transform: 'translateY(0)' },
          '50%':  { opacity: '0.7' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        ticker:    'ticker 30s linear infinite',
        pulse_dot: 'pulse_dot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
