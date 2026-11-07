// La configuración de Vite. Solo hace falta para «npm run build»: genera dist/ con nombres
// fijos (gravity.js, con Three.js dentro, y gravity.css), sin códigos de versión en el
// nombre. Así la web de VERTIK (vertik.net/gravity) los copia y los carga siempre igual.
import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: dist/ funciona sirviéndolo desde cualquier carpeta.
  base: './',
  build: {
    // Three.js va dentro: que Vite no avise del tamaño.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        entryFileNames: 'gravity.js',
        chunkFileNames: 'gravity-[name].js',
        assetFileNames: 'gravity[extname]',
      },
    },
  },
});
