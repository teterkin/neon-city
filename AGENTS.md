# Neon Drift — заметки для агентов

## Node

Проект требует Node **>= 22.12.0**, эталон — `.nvmrc` (24.14.0). В неинтерактивном
shell `nvm` не загружается, и системный `node` может оказаться 20.x. Тогда Vite
падает на `crypto.hash is not a function` — это версия Node, а не код.

Перед тестами, сборкой и `npm run dev` всегда:

```bash
source ~/.nvm/nvm.sh && nvm use 24.14.0
node -v            # ожидается v24.14.0
```

Проверки проекта:

```bash
npm test               # node --test
npm run build:single   # dist/ + neon-city.html
npm run verify:bundle  # в neon-city.html нет внешних ссылок
```
