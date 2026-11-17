import tailwindcss from '@tailwindcss/vite';

export default {
  cacheDir: '/tmp/airrest_web_vite_cache',
  plugins: [tailwindcss()],
  preview: {
    allowedHosts: ['airrest-website.onrender.com'],
  },
};
