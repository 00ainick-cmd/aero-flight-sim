type Attrs = Record<string, string | number | boolean | undefined>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c != null) el.append(c);
  return el;
}

const textCache = new WeakMap<Element, string>();
export function setText(el: Element, s: string) {
  if (textCache.get(el) !== s) {
    textCache.set(el, s);
    el.textContent = s;
  }
}

const htmlCache = new WeakMap<Element, string>();
/** Replace innerHTML only when the markup actually changed. Returns true if replaced. */
export function setHTML(el: Element, s: string): boolean {
  if (htmlCache.get(el) === s) return false;
  htmlCache.set(el, s);
  el.innerHTML = s;
  return true;
}

export function cls(el: Element, name: string, on: boolean) {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}

export function screw(extra = ''): HTMLElement {
  const s = h('span', { class: `screw ${extra}` });
  s.style.setProperty('--rot', `${Math.floor(Math.random() * 180)}deg`);
  return s;
}

/** Fires onPress on pointerdown; onHold after holdMs if still held (onPress then is skipped). */
export function pressable(
  el: HTMLElement,
  opts: { onPress?: () => void; onHold?: () => void; onRelease?: () => void; holdMs?: number; pressOnDown?: boolean },
) {
  let timer = 0;
  let held = false;
  let down = false;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    down = true;
    held = false;
    el.classList.add('pressed');
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    if (opts.pressOnDown) opts.onPress?.();
    if (opts.onHold) {
      timer = window.setTimeout(() => {
        held = true;
        opts.onHold?.();
      }, opts.holdMs ?? 900);
    }
  });
  const up = () => {
    if (!down) return;
    down = false;
    el.classList.remove('pressed');
    clearTimeout(timer);
    if (!held && !opts.pressOnDown) opts.onPress?.();
    opts.onRelease?.();
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}
