import {
  developmentLevelUrl,
  parseDevelopmentLevel,
  resolveDevelopmentLaunch,
} from './DevelopmentLaunch';

const LAUNCHER_ID = 'development-level-launcher';

export function mountDevelopmentLevelLauncher(): HTMLFormElement {
  document.getElementById(LAUNCHER_ID)?.remove();

  const currentLaunch = resolveDevelopmentLaunch(
    true,
    window.location.search,
  );
  const form = document.createElement('form');
  form.id = LAUNCHER_ID;
  form.className = 'development-level-launcher';
  form.setAttribute('aria-label', 'Запуск гри з вибраного рівня');

  const badge = document.createElement('span');
  badge.className = 'development-level-launcher__badge';
  badge.textContent = 'DEV';

  const label = document.createElement('label');
  label.htmlFor = `${LAUNCHER_ID}-input`;
  label.textContent = 'Рівень';

  const input = document.createElement('input');
  input.id = label.htmlFor;
  input.name = 'level';
  input.type = 'number';
  input.min = '1';
  input.max = String(Number.MAX_SAFE_INTEGER);
  input.step = '1';
  input.inputMode = 'numeric';
  input.value = String(currentLaunch?.initialLevelNumber ?? 1);
  input.title = 'Додатне ціле число';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = '▶';
  submit.title = 'Перезапустити у build-фазі цього рівня';
  submit.setAttribute('aria-label', 'Запустити вибраний рівень');

  input.addEventListener('input', () => input.setCustomValidity(''));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const levelNumber = parseDevelopmentLevel(input.value);
    if (levelNumber === null) {
      input.setCustomValidity('Введіть додатне ціле число.');
      input.reportValidity();
      return;
    }

    window.location.assign(
      developmentLevelUrl(window.location.href, levelNumber),
    );
  });

  form.append(badge, label, input, submit);
  document.body.append(form);
  return form;
}
