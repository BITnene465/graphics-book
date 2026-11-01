/** 拖动数值微调，点击输入精确值；Shift 拖动减慢十倍。 */
export function numberField(
  label: string,
  min: number,
  max: number,
  step: number,
  begin: () => void,
  change: (value: number) => void,
  signal: AbortSignal,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'number-field';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.readOnly = true;
  input.setAttribute('aria-label', label);
  input.title = '拖动调整 · 点击输入 · Shift 精调';
  let drag: { x: number; value: number; moved: boolean } | undefined;
  let editing = false;
  let original = '';
  const startEditing = () => {
    original = input.value;
    input.readOnly = false;
    input.select();
  };
  const apply = (value: number) => {
    if (!Number.isFinite(value)) return;
    value = Math.max(min, Math.min(max, Math.round(value / step) * step));
    input.value = String(Number(value.toFixed(8)));
    change(value);
  };
  input.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0 || !input.readOnly) return;
      event.preventDefault();
      drag = { x: event.clientX, value: Number(input.value), moved: false };
      input.setPointerCapture(event.pointerId);
      input.focus({ preventScroll: true });
    },
    { signal },
  );
  input.addEventListener(
    'pointermove',
    (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 3) return;
      if (!drag.moved) {
        begin();
        drag.moved = true;
      }
      apply(drag.value + dx * step * (event.shiftKey ? 0.1 : 1));
    },
    { signal },
  );
  input.addEventListener(
    'pointerup',
    () => {
      if (drag && !drag.moved) startEditing();
      drag = undefined;
    },
    { signal },
  );
  input.addEventListener(
    'pointercancel',
    () => {
      drag = undefined;
    },
    { signal },
  );
  input.addEventListener(
    'change',
    () => {
      if (!input.value) {
        input.value = original;
        return;
      }
      if (input.value === original) return;
      if (!editing) {
        begin();
        editing = true;
      }
      apply(Number(input.value));
    },
    { signal },
  );
  input.addEventListener(
    'blur',
    () => {
      input.readOnly = true;
      editing = false;
    },
    { signal },
  );
  input.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter') {
        if (input.readOnly) startEditing();
        else input.blur();
      } else if (event.key === 'Escape') {
        if (!input.readOnly) input.value = original;
        input.blur();
        event.stopPropagation();
      } else if (
        input.readOnly &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
      ) {
        event.preventDefault();
        begin();
        apply(Number(input.value) + (['ArrowUp', 'ArrowRight'].includes(event.key) ? step : -step));
      }
    },
    { signal },
  );
  return input;
}
