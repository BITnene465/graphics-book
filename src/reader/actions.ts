import { icon } from './icons.ts';

/** 窄屏把次要动作收进菜单；保留原按钮和事件，桌面仍直接显示。 */
export function compactActions(host: HTMLElement, signal: AbortSignal): void {
  const actions = host.querySelector<HTMLElement>('.figure-actions')!;
  for (const button of actions.querySelectorAll<HTMLButtonElement>('button')) {
    button.innerHTML = icon(button.dataset.action!);
    button.setAttribute('aria-label', button.getAttribute('aria-label') || button.title);
  }
  const extra = document.createElement('div');
  extra.className = 'figure-extra-actions';
  for (const button of [...actions.querySelectorAll('button')].slice(1)) {
    const label = document.createElement('span');
    label.textContent = button.title;
    button.append(label);
    extra.append(button);
  }
  const toggle = document.createElement('button');
  toggle.className = 'figure-actions-toggle';
  toggle.textContent = '⋯';
  toggle.setAttribute('aria-label', '更多演示操作');
  toggle.setAttribute('aria-expanded', 'false');
  const close = () => {
    extra.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };
  toggle.addEventListener(
    'click',
    () => {
      toggle.setAttribute('aria-expanded', String(extra.classList.toggle('is-open')));
    },
    { signal },
  );
  document.addEventListener(
    'click',
    (event) => {
      if (event.target !== toggle) close();
    },
    { signal },
  );
  actions.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') {
        close();
        toggle.focus();
      }
    },
    { signal },
  );
  actions.append(toggle, extra);
}
