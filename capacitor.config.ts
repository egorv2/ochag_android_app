import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Нативная обёртка Android. Веб-часть собирается в dist/, затем `npx cap sync android`.
 * cleartext: true — чтобы в dev можно было указать http:// адрес домашнего сервера.
 * В проде используйте HTTPS и уберите cleartext.
 */
const config: CapacitorConfig = {
  appId: 'ru.ochag.assistant',
  appName: 'Очаг',
  webDir: 'dist',
  server: {
    cleartext: true,
  },
  android: {
    // DEV только: WebView грузится с https://localhost, а бэкенд может быть по http.
    // Для прода убрать и перевести бэкенд на HTTPS.
    allowMixedContent: true,
  },
};

export default config;
