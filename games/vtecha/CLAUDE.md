# Втеча

Гра з розділу ігор сайту, публікується за адресою `/games/vtecha/`. Правила цього файлу діють лише в межах теки гри.

- Єдине джерело правди — `GAME_DESIGN.md`; порядок змін і комітів описано на його початку. Документ великий: читати лише потрібний розділ (заголовки — `grep -n "^## " GAME_DESIGN.md`), константи — §16, прийняті рішення — §19.
- Стек: TypeScript, PixiJS, Vite, Vitest.
- Команди (з кореня): `npm run typecheck -w games/vtecha`, `npm test -w games/vtecha`, `npm run build -w games/vtecha`, `npm run dev -w games/vtecha`.
