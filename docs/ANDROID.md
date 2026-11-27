# Сборка Android (Capacitor)

Проект `android/` уже сгенерирован (`npx cap add android`) и настроен. Для сборки APK нужны
**JDK 17**, **Android SDK** (API 35 / targetSdk из `android/variables.gradle`) и Android Studio
или Gradle из командной строки. В этом окружении JDK/Android SDK нет, поэтому APK здесь не собирался —
ниже воспроизводимая инструкция для локальной машины.

## 1. Предварительные требования

```bash
java -version                 # 17+
echo $ANDROID_HOME            # путь к Android SDK
npm install
npm run build                 # dist/ — веб-часть приложения
```

## 2. Синхронизация и сборка

```bash
npm run cap:sync              # build + копирование dist/ в android/app/src/main/assets/public
npm run cap:open              # открыть android/ в Android Studio
# в Android Studio: Build → Build Bundle(s) / APK(s) → Build APK(s)
```

Или из командной строки:

```bash
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
```

`capacitor.config.ts`:

```ts
appId: 'ru.ochag.assistant'
appName: 'Очаг'
webDir: 'dist'
server: { cleartext: true }             // dev: разрешить http-бэкенд
android: { allowMixedContent: true }    // dev: WebView на https://localhost → http-бэкенд
```

## 3. Адрес бэкенда на устройстве

`/api` — это dev-прокси Vite, на устройстве его нет. В настройках приложения укажите полный URL:

| Где запущен клиент | Адрес бэкенда |
| --- | --- |
| Эмулятор Android, бэкенд на хосте | `http://10.0.2.2:8000` (значение по умолчанию при `Capacitor.isNativePlatform()`) |
| Физическое устройство, бэкенд в LAN | `http://192.168.x.x:8000` |
| Продакшен | `https://api.example.com` + уберите `cleartext` / `allowMixedContent` / `usesCleartextTraffic` |

`session_id` генерируется при первом запуске и хранится в `localStorage` WebView; API-ключ вводится
в листе «Подключение». Кнопка «Проверить соединение» вызывает `/health`, `/ready` и drafts.

## 4. Микрофон

`AndroidManifest.xml` объявляет:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.INTERNET" />
```

Capacitor `BridgeWebChromeClient.onPermissionRequest()` сам запрашивает runtime-разрешения и
вызывает `request.grant()` для `AUDIO_CAPTURE`, поэтому `getUserMedia` + `AudioWorklet` работают
в WebView без дополнительного нативного кода. Если пользователь отказал — приложение покажет
подсказку и останется доступен текстовый ввод.

## 5. Иконки и тема

`scripts/make-icons.py` генерирует PWA-иконки и `mipmap-*/ic_launcher*.png` (обычные, круглые и
foreground для adaptive icon). Цвета приложения — `android/app/src/main/res/values/colors.xml`,
фон adaptive icon — `ic_launcher_background.xml`. Перегенерация:

```bash
python3 scripts/make-icons.py
npm run cap:sync
```

## 6. Типичные проблемы

| Симптом | Причина / лечение |
| --- | --- |
| `net::ERR_CLEARTEXT_NOT_PERMITTED` | Dev-флаги `cleartext`/`usesCleartextTraffic` удалены или бэкенд по http на Android 9+ — верните для dev. |
| Mixed content / запросы блокируются | WebView грузится с `https://localhost`, бэкенд по `http://` — нужен `android.allowMixedContent` (только dev) или HTTPS. |
| Микрофон молчит | Нет runtime-разрешения, либо устройство без микрофона; проверьте `RECORD_AUDIO` и системный запрос. |
| WS сразу закрывается с кодом 1008 | Неверный `token` (API-ключ) в query; проверьте экран настроек. |
| «Черновик не найден» / 409 | Истёк TTL (10 мин), сменился `session_id`, либо черновик уже отправлен. |
| Белый экран после обновления | Запустите `npm run cap:sync`, чтобы обновить `assets/public`. |

## 7. Сборка в GitHub Actions (для окружений без Android SDK)

Workflow `.github/workflows/build-apk.yml` собирает debug-APK на `ubuntu-latest`:
Node 20 + JDK 17 + Android SDK (platform 34, build-tools 34.0.0) → `npm ci` → `npm run build` →
`npx cap sync android` → `./gradlew assembleDebug`. Готовый файл публикуется артефактом
`Ochag-debug-apk` **и** коммитится обратно в ветку как `apk/Ochag-debug.apk`
(коммит с `[skip ci]`, чтобы не было повторного запуска). Запускается при push в ветку
или вручную: `gh workflow run build-apk.yml`.

## 8. Что осталось за рамками

Подпись release-сборки (keystore), Play Store, push-уведомления, wake word и VAD, фоновая запись,
реальный MAX-мост/бот, пользовательская авторизация вместо общего API-ключа.
