// Presentation preference only; never reads admin credentials.
(() => {
  const system = matchMedia('(prefers-color-scheme: dark)');
  const valid = value => ['system','light','dark'].includes(value) ? value : 'system';
  let mode = 'system';
  try { mode = valid(localStorage.getItem('mapmarket.appearance')); } catch {}
  function apply(value) {
    mode = valid(value);
    const theme = mode === 'system' ? (system.matches ? 'dark' : 'light') : mode;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.style.colorScheme = theme;
  }
  apply(mode);
  system.addEventListener('change', () => apply(mode));
  window.addEventListener('storage', e => { if (e.key === 'mapmarket.appearance') apply(e.newValue); });
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'action'; button.textContent = 'Профиль администратора';
    button.id = 'adminAppearanceProfile';
    document.querySelector('.connection').append(button);
    const modal = document.createElement('dialog'); modal.className = 'adjustment-dialog';
    modal.innerHTML = '<h2>Профиль администратора</h2><h3>Настройки → Оформление</h3><fieldset><legend>Тема</legend><label><input type="radio" name="adminTheme" value="system">Системная — Использовать тему устройства</label><label><input type="radio" name="adminTheme" value="light">Светлая</label><label><input type="radio" name="adminTheme" value="dark">Тёмная</label></fieldset><button type="button" data-close-theme>Закрыть</button>';
    document.body.append(modal);
    button.onclick = () => { modal.querySelector(`[value="${mode}"]`).checked = true; modal.showModal(); };
    modal.querySelector('[data-close-theme]').onclick = () => modal.close();
    modal.addEventListener('change', e => {
      if (e.target.name !== 'adminTheme') return;
      apply(e.target.value);
      try { localStorage.setItem('mapmarket.appearance', mode); } catch {}
    });
    modal.addEventListener('close', () => button.focus());
  });
})();
