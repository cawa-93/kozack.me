# Ігри

Кожна гра — окремий Vite-проєкт зі своїми `package.json`, скриптами й версіями залежностей,
підключений до репозиторію як npm workspace. У репозиторії лежить лише вихідний код:
збірки ігор у `public/games/<slug>` створюються під час збирання й у git не потрапляють.

## Команди

Усе запускається з кореня репозиторію:

```sh
npm install                          # залежності сайту й усіх ігор
npm run build -w games/<slug>        # зібрати одну гру в public/games/<slug>
npm run build:games                  # зібрати всі ігри
npm run build                        # зібрати всі ігри, а потім сайт (це запускає деплой)
```

Інші скрипти гри запускаються так само: `npm test -w games/<slug>`. Можна й перейти в теку
гри та викликати `npm run …` там.

Щоб ігри відкривалися в `npm run dev` сайту, їх треба спершу зібрати.

## Додати нову гру

1. Покласти проєкт у `games/<slug>` (без власного `package-lock.json`) і виконати `npm install` у корені.
2. У `vite.config.ts` гри вказати:
   - `base: command === "build" ? "/games/<slug>/" : "/"`;
   - `build.outDir: "../../public/games/<slug>"` і `build.emptyOutDir: true`.

   Шляхи до файлів з `public/` гри будувати від `import.meta.env.BASE_URL`, а не від `/`.
3. Додати запис у `src/data/games.ts` і обкладинку 16:9 у `src/assets/games/<slug>.jpg`.

Усі ігри працюють на одному домені й ділять `localStorage`, тож ключі мають бути з
унікальним префіксом гри.
