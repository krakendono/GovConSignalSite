import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        base: '#f7f8f5',
        ink: '#0f1720',
        signal: '#c2410c',
        accent: '#14532d',
      },
    },
  },
  plugins: [],
}

export default config
