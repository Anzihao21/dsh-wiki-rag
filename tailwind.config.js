/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // 与 DSH 原有 UI 风格对齐的暗色主题色板
        dsh: {
          bg: '#0f1115',
          panel: '#171a21',
          border: '#2a2f3a',
          accent: '#4c8dff',
          text: '#e6e9ef',
          muted: '#8b93a3'
        }
      }
    }
  },
  plugins: []
};
