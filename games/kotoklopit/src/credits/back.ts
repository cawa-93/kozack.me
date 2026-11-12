// «Назад до гри» на сторінці титрів (§2.1). Гра відкриває титри в новій вкладці, тож перехід за посиланням відкрив би другу
// вкладку гри поруч із першою, а та лише чекала б, доки першу закриють (§4.2, «Одна вкладка»). Тому вкладку, яку щойно
// відкрила гра, посилання закриває; браузер не дав закрити чи титри відкрито інакше — звичайний перехід.

const fromGame = (): boolean => {
  if (history.length > 1 || !document.referrer) return false;
  try {
    return new URL(document.referrer).pathname === new URL("./", location.href).pathname;
  } catch {
    return false;
  }
};

for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-back]")) {
  link.addEventListener("click", (event) => {
    if (!fromGame()) return;
    event.preventDefault();
    window.close();
    // Закрилася — таймер уже не спрацює.
    window.setTimeout(() => location.assign(link.href), 300);
  });
}
