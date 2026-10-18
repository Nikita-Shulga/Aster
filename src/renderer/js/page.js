import {str, fixIndeterminate, fail} from './lib.js';

// Minimal page runtime: a view() that returns html, and delegated handlers
// wired through data-action / data-change / data-input attributes.
export function definePage(def) {
  const page = {
    ...def,
    el: null,
    mounted: false,
    mount(el) {
      this.el = el; this.mounted = true;
      el.onclick = e => this.dispatch(e, 'action');
      el.onchange = e => this.dispatch(e, 'change');
      el.oninput = e => this.dispatch(e, 'input');
      el.onkeydown = e => { if (e.key === 'Enter') this.dispatch(e, 'enter'); };
      el.ondblclick = e => this.dispatch(e, 'dblclick');
      el.oncontextmenu = e => this.dispatch(e, 'context');
      this.update();
      def.onMount?.call(this);
    },
    unmount() { this.mounted = false; def.onUnmount?.call(this); },
    update() {
      if (!this.mounted || !this.el) return;
      const active = document.activeElement;
      const key = active && this.el.contains(active) ? active.dataset.key : null;
      const caret = key && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
      this.el.innerHTML = str(def.view.call(this));
      fixIndeterminate(this.el);
      if (key) {
        const again = this.el.querySelector(`[data-key="${CSS.escape(key)}"]`);
        if (again) { again.focus(); if (caret) try { again.setSelectionRange(...caret); } catch {} }
      }
      def.afterRender?.call(this);
    },
    dispatch(e, kind) {
      const attr = kind === 'action' ? 'action' : kind;
      const target = e.target.closest(`[data-${attr}]`);
      if (!target || !this.el.contains(target)) return;
      const name = target.dataset[attr];
      const fn = def.on?.[name];
      if (!fn) return;
      if (kind === 'context') e.preventDefault();
      if (target.tagName === 'A' || (kind === 'action' && target.type === 'submit')) e.preventDefault();
      Promise.resolve(fn.call(this, target, e)).catch(fail);
    }
  };
  return page;
}
