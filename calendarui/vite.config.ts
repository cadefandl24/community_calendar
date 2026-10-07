import { defineConfig } from 'vite';
import plugin from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'


// https://vitejs.dev/config/
export default defineConfig({
    plugins: [plugin(), tailwindcss()],
    server: {
        port: 63566,
        strictPort: false,
        proxy: {
            '/api': 'http://localhost:3001',
            '/hubs': { target: 'http://localhost:3001', ws: true },
        },
    }
})
