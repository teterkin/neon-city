# Neon Drift

Бесконечный процедурный sci-fi мегаполис на Three.js: instanced-здания, высота и неон
которых выводятся из 2D simplex-шума, стриминг кварталов вокруг камеры и мокрый асфальт
с отражениями.

## Управление

- `V` — переключить режим «высота» ↔ «улица»
- перетаскивание мышью/пальцем — осмотреться (камера сама возвращается к курсу)
- кнопка в правом нижнем углу — то же переключение для тача

В режиме «высота» камера летит над проспектом на ~96 м, в режиме «улица» — по центру
проспекта на ~3 м. Повороты на 90° работают **только в уличном режиме**: камера
поворачивает на другую улицу каждые 1–2 квартала, примерно раз в 4–9 секунд, причём
поворот начинается уже на **въезде** в перекрёсток, а не после его центра. В режиме
«высота» полёт всегда прямой. Оба режима работают без ввода, город генерируется сам.

Над городом летают грузовые и пассажирские аэроспидеры — по всем четырём
направлениям проспектов (вперёд/назад и влево/вправо), а впереди камеры идёт наш
спидер с неоновыми крыльями и двигателем. Иногда в небе проносятся метеоры и
вспыхивают при падении на город.

При запуске показывается загрузчик с прогрессом: проверка WebGL → генерация города →
трафик → компиляция шейдеров → первый кадр. Он скрывает белую вспышку и долгий старт
WebView в Telegram.

## Локальный запуск

```bash
nvm use            # Node 24.14.0 из .nvmrc
npm ci
npm run dev        # http://localhost:5173
```

Полезные параметры URL:

- `?quality=high` / `?quality=low` — принудительный уровень качества
- `?adaptive=0` — отключить авто-деградацию качества при низком FPS
- `?turn=0.9` — шанс поворота на каждом перекрёстке для отладки (0…1); без параметра
  работает расписание «через 1–2 квартала». `?turn=1` — поворачивать на каждом перекрёстке
- `?traffic=0` — выключить аэроспидеры
- `?meteors=0` — выключить метеоры
- пример: `http://localhost:5173/?quality=high&adaptive=0&turn=0.6`

## Сборка

```bash
npm test               # node --test, логика без WebGL
npm run build          # dist/
npm run build:single   # dist/index.html + neon-city.html (self-contained)
npm run verify:bundle  # проверяет, что в neon-city.html нет внешних ссылок
```

`neon-city.html` — один файл ~583 КБ: three.js, стили и шейдеры встроены, ни одного
внешнего запроса. Его можно открыть двойным щелчком с диска или отправить файлом.

## Музыка

Процедурный луп для города генерируется кодом, без семплов и чужих мелодий:

```bash
npm run track
```

`scripts/audio/synth.mjs` собирает 16 тактов при **108 BPM** (35.556 с, 44.1 кГц,
16-bit stereo): плотный аналоговый бас, ретро-пэды, арпеджио, лид, драм-машина,
глитч-вставки, круговые delay и reverb. Длина лупа сэмпл-точная — 1 568 000 сэмплов,
а шов сглажен, поэтому файл можно ставить на repeat без щелчка.

Результат: `neon-drift-108bpm.wav` (~6 МБ). MP3 для мессенджеров:

```bash
ffmpeg -y -i neon-drift-108bpm.wav -codec:a libmp3lame -b:a 192k neon-drift-108bpm.mp3
```

Замеры: −13.5 LUFS integrated, true peak −0.6 dBFS. Аудиофайлы не коммитятся —
их можно пересобрать командой выше.

## Telegram

Однофайловая сборка работает в обычном браузере, в том числе по `file://`.

Важно: **вложение `.html` в Telegram на iOS открывается в Quick Look, который не
выполняет JavaScript** (известное ограничение Telegram-iOS, issue #288). На Android
файл может открыться в Chrome и заработать, но поведение зависит от телефона. Поэтому
для дочки надёжный путь — отправить HTTPS-ссылку на этот же файл:

1. `npm run build:single`
2. загрузите `neon-city.html` на любой статический хостинг без сборки
   (Netlify Drop, Cloudflare Pages, GitHub Pages) — файл самодостаточный
3. отправьте ссылку в Telegram: она откроется во встроенном браузере

WebGL 2.0 в Telegram WebView обычно доступен, но конкретное устройство я проверить не
могу. Если на телефоне будет тяжело, добавьте к ссылке `?quality=low`.

## Telegram Mini App (Web App)

Приложение — обычная статическая страница, поэтому из него легко сделать Telegram
Mini App: Telegram открывает HTTPS-ссылку в своём WebView, а мы получаем кнопку
«Играть» в чате с ботом.

### 1. Соберите и опубликуйте страницу

```bash
npm run build:single
cp neon-city.html index.html   # удобно для корня сайта
```

Загрузите `index.html` на любой HTTPS-хостинг с валидным сертификатом:

- **GitHub Pages** — положите `index.html` в репозиторий, затем Settings → Pages →
  Deploy from a branch (корень или `/docs`);
- **Cloudflare Pages / Netlify Drop** — перетащите папку, получите `https://…`;
- **свой сервер** — обычный nginx/Apache со статикой и TLS.

Проверьте ссылку в браузере телефона до Telegram. Требования Telegram: только
**публичный HTTPS**, без `localhost`, без самоподписанного сертификата.

### Пример: GitHub Pages

**Вариант 1 — вручную, без CI (5 минут).** Соберите файл и положите его как
`index.html` в отдельный репозиторий:

```bash
npm run build:single
mkdir -p /tmp/neon-pages && cp neon-city.html /tmp/neon-pages/index.html
cd /tmp/neon-pages
git init -b main
git add index.html
git commit -m "deploy neon city"
git remote add origin https://github.com/<USER>/neon-city.git
git push -u origin main
```

Затем в GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
branch → Branch: `main` / `(root)` → Save**. Через 1–2 минуты приложение будет здесь:

```
https://<USER>.github.io/neon-city/
```

Эту ссылку уже можно вставлять в BotFather. Обновление — повторить сборку, скопировать
`index.html`, закоммитить и запушить. Проверьте, что в Pages включён **Enforce HTTPS**.

**Вариант 2 — GitHub Actions, деплой на каждый push.** Исходники живут в репозитории,
Pages собирается сам. Добавьте `.github/workflows/pages.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build:single
      - run: mkdir -p site && cp neon-city.html site/index.html
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

В GitHub: **Settings → Pages → Source: GitHub Actions**. После push workflow прогонит
тесты, соберёт single-file и опубликует его. Для продакшена полезно запинить actions по
commit SHA вместо тегов `v4` — так безопаснее.

В этом проекте готовый workflow уже лежит в `.github/workflows/pages.yml`, а remote —
`git@github.com:teterkin/neon-city.git`. Достаточно один раз включить Pages → Source:
GitHub Actions и запушить `main`:

```bash
git remote add origin git@github.com:teterkin/neon-city.git
git push -u origin main
```

Сайт появится по адресу `https://teterkin.github.io/neon-city/`.

Если репозиторий называется `<USER>.github.io`, сайт откроется в корне
`https://<USER>.github.io/`, иначе — по пути `/neon-city/`. Требование Pages — файл
`index.html` в корне выбранной папки; наш `neon-city.html` переименовывается в него.
Размер 583 КБ для лимитов Pages (1 ГБ на сайт) не проблема.

### 2. Создайте бота и Mini App в @BotFather

1. `/newbot` → имя → username → получите токен (не публикуйте его в репозитории).
2. `/newapp` → выберите бота → название, описание, иконка (640×360) → **URL
   приложения** (ваша HTTPS-ссылка на `index.html`).
3. BotFather даст прямую ссылку вида `https://t.me/<bot_username>/<app_name>`.
   Она уже открывает приложение как Mini App.
4. Альтернатива без `/newapp`: `/mybots` → ваш бот → **Bot Settings → Menu Button →
   Configure menu button** → вставьте URL и подпись. Кнопка появится в чате с ботом.

Вместо BotFather кнопку можно поставить через Bot API (токен — только в переменной
окружения, не в файлах):

```bash
curl -X POST "https://api.telegram.org/bot$TG_TOKEN/setChatMenuButton" \
  -H "Content-Type: application/json" \
  -d '{"menu_button":{"type":"web_app","text":"В город","web_app":{"url":"https://example.com/"}}}'
```

### 3. Проверка и отладка

- откройте `https://t.me/<bot_username>/<app_name>` на телефоне;
- Android: `chrome://inspect` на компьютере — консоль WebView; iOS: Safari →
  Develop → телефон (нужно включить Web Inspector);
- если на слабом телефоне мало FPS — добавьте `?quality=low` к URL приложения;
- для локальной отладки нужен туннель, например
  `cloudflared tunnel --url http://localhost:5173` — Telegram не откроет localhost.

### 4. SDK Telegram (необязательно)

Для запуска SDK не нужен: Mini App — это просто HTTPS-страница. Если нужны
`expand()`, `disableVerticalSwipes()`, цвета темы и данные пользователя, добавьте в
`index.html` перед своим скриптом:

```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
```

и вызовите `Telegram.WebApp.ready(); Telegram.WebApp.expand();`. Учтите: это
единственный внешний запрос, и `neon-city.html` перестанет быть полностью
автономным — для Mini App это нормально, для отправки файлом лучше оставить текущую
сборку без SDK.

## Как это устроено

- `src/noise.js` — seeded simplex 2D, fbm и хеши
- `src/layout.js` — чистая функция `cellLayout(ix, iz)`: высота из fbm, footprint из
  хешей, палитра, проспекты каждые 7 ячеек
- `src/city.js` — `InstancedMesh` + кольцо ячеек вокруг камеры, переиспользование
  слотов, анимация роста, зеркальный прокси зданий для отражений
- `src/materials/*` — шейдеры зданий (окна, неон, туман), земли (сетка, лужи) и неба
- `src/cameraRig.js` — два режима полёта, drag-осмотр, плавные переходы
- `src/streetNav.js` — навигация по сетке проспектов со случайными поворотами
- `src/trafficModel.js` — чистая модель аэроспидеров: спавн по проспектам, скорости,
  высоты, переиспользование; `escortPose` для нашего спидера
- `src/traffic.js`, `src/escort.js` — инстансинг трафика и наш спидер
- `src/meteorModel.js` — чистая модель метеоров: задержки, спавн впереди камеры,
  падение и вспышка при ударе
- `src/meteors.js` — инстанс-стрики метеоров и спрайты вспышек
- `src/loadProgress.js` — веса стадий загрузчика
- `src/quality.js` — выбор high/low по устройству и деградация по FPS

Тесты покрывают только чистую логику (`node --test`, 71 тест): шум, раскладку ячеек,
стриминг инстансов, рост, навигацию с поворотами, модель трафика, выбор качества и
WebGL-детект. Визуал проверяется глазами — WebGL в CI не рендерится.

## Ограничения

- нет коллизий и физики: уличная камера всегда летит по центру проспекта
- отражения — зеркальный instanced-прокси с маской луж, не screen-space/planar reflection
- город не сохраняется, каждый запуск — тот же сид и та же застройка
