# Ігри

Кожна гра — окремий Vite-проєкт зі своїми залежностями. Сайт ігри не збирає: він публікує
готову збірку з `public/games/<slug>` як є.

## Оновити гру

```sh
cd games/<slug>
npm ci
npm run build   # перезаписує public/games/<slug>
```

Зміни в `games/<slug>` комітяться разом з оновленою збіркою в `public/games/<slug>`.

## Додати нову гру

1. Покласти проєкт у `games/<slug>`.
2. У `vite.config.ts` гри вказати:
   - `base: command === "build" ? "/games/<slug>/" : "/"`;
   - `build.outDir: "../../public/games/<slug>"` і `build.emptyOutDir: true`.

   Шляхи до файлів з `public/` гри будувати від `import.meta.env.BASE_URL`, а не від `/`.
3. Зібрати гру: `npm run build`.
4. Додати запис у `src/data/games.ts` і обкладинку 16:9 у `src/assets/games/<slug>.jpg`.

Усі ігри працюють на одному домені й ділять `localStorage`, тож ключі мають бути з
унікальним префіксом гри.
