// The tuning panel: one row per entry of the slider table, each with a reset; camera presets; Export and
// "Reset all". Built from plain DOM, no library.
import { BUILD, buildExport, copyText } from './exporter';
import {
  CAMERA_PRESETS,
  CAMERA_PROFILES,
  profileActive,
  GROUPS,
  PARAMS,
  type ChoiceParam,
  type GroupId,
  type Param,
  type RangeParam,
  type Store,
  type ToggleParam,
} from './params';

type Refresher = () => void;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function fmt(p: RangeParam, v: number): string {
  return v.toFixed(p.digits);
}

export class Panel {
  readonly root: HTMLDivElement;
  private refreshers: Refresher[] = [];
  private exportBox: HTMLDivElement;
  private exportText: HTMLTextAreaElement;
  private exportStatus: HTMLSpanElement;

  constructor(private store: Store, extraGroups: Partial<Record<GroupId, (body: HTMLElement) => void>> = {}) {
    this.root = el('div');
    this.root.id = 'panel';

    const head = el('div', 'p-head');
    const title = el('div', 'p-title');
    title.append(el('b', '', 'Shamble Testlines'), el('span', 'p-build', ` step ${BUILD.step} · ${BUILD.name}`));
    const btns = el('div', 'p-btns');
    const exportBtn = el('button', 'p-btn p-primary', 'Export');
    exportBtn.title = 'Copy every current value as JSON, with the date';
    const resetAll = el('button', 'p-btn', 'Reset all');
    resetAll.title = 'Put every value back to its start value';
    const hide = el('button', 'p-btn', 'Hide `');
    hide.title = 'Hide or show this panel (backquote key)';
    btns.append(exportBtn, resetAll, hide);
    head.append(title, btns);
    this.root.append(head);
    this.root.append(el('div', 'p-note', 'Sandbox values, not decisions. Hover a name to see where its start value comes from.'));

    this.exportBox = el('div', 'p-export');
    this.exportBox.hidden = true;
    this.exportStatus = el('span', 'p-export-status');
    this.exportText = el('textarea');
    this.exportText.readOnly = true;
    this.exportText.spellcheck = false;
    const close = el('button', 'p-btn', 'Close');
    const selectAll = el('button', 'p-btn', 'Select all');
    const exRow = el('div', 'p-export-row');
    exRow.append(this.exportStatus, selectAll, close);
    this.exportBox.append(exRow, this.exportText);
    this.root.append(this.exportBox);

    exportBtn.addEventListener('click', async () => {
      const text = buildExport(this.store);
      this.exportText.value = text;
      this.exportBox.hidden = false;
      const ok = await copyText(text);
      this.exportStatus.textContent = ok ? 'Copied to the clipboard.' : 'Copy blocked by the browser: select the text below and copy it.';
      this.exportText.scrollTop = 0;
    });
    selectAll.addEventListener('click', () => {
      this.exportText.focus();
      this.exportText.select();
    });
    close.addEventListener('click', () => {
      this.exportBox.hidden = true;
      this.exportText.blur();
    });
    resetAll.addEventListener('click', () => {
      if (window.confirm('Put every value back to its start value?')) this.store.resetAll();
    });
    hide.addEventListener('click', () => this.toggle());

    const scroll = el('div', 'p-scroll');
    for (const g of GROUPS) {
      const params = PARAMS.filter((p) => p.group === g.id);
      if (!params.length && !extraGroups[g.id]) continue;
      const sec = el('details', 'p-group');
      sec.open = g.open;
      const sum = el('summary', '', g.title);
      sec.append(sum);
      const body = el('div', 'p-body');
      if (g.id === 'camera') body.append(this.presetRow());
      for (const p of params) body.append(this.row(p));
      extraGroups[g.id]?.(body);
      sec.append(body);
      scroll.append(sec);
    }
    scroll.append(
      el(
        'div',
        'p-keys',
        'WASD move · Shift sprint · Space jump · mouse aims · left button fires · right button or Q aims down sights (in Firefox, Shift + right click opens the browser menu: use Q while sprinting) · R reloads (tap R again while the bar is in the gold window: the reload ends at once) · hold the middle button to turn the camera · 1 / 2 / 3 guns · hold G and let go to throw a grenade · ` panel',
      ),
    );
    this.root.append(scroll);

    // Keep the game's keys away from the panel once the mouse lets go: anything that can hold focus (a slider,
    // a button, a group header, a check box) gives it back, so Space jumps instead of pressing it. Only the
    // value fields and the Export text keep focus, for typing.
    this.root.addEventListener('pointerup', () => {
      setTimeout(() => {
        const a = document.activeElement as HTMLElement | null;
        if (!a || !this.root.contains(a)) return;
        if (a instanceof HTMLTextAreaElement || (a instanceof HTMLInputElement && a.type === 'text')) return;
        a.blur();
      }, 0);
    });
    this.root.addEventListener('keydown', (e) => {
      // A focused header or check box would toggle on Space or Enter: never let the game's keys do that.
      const t = e.target as HTMLElement;
      if (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type === 'text')) return;
      if (e.code === 'Space' || e.code === 'Enter') e.preventDefault();
    });

    store.onChange(() => this.refresh());
    document.body.append(this.root);
    document.body.classList.add('panel-open');
    // Light the active profile from the start.
    this.refresh();
  }

  toggle() {
    const hidden = this.root.classList.toggle('hidden');
    document.body.classList.toggle('panel-open', !hidden);
  }

  refresh() {
    for (const r of this.refreshers) r();
  }

  private presetRow(): HTMLElement {
    const wrap = el('div');
    const mk = (label: string, list: { name: string; title: string; values: Record<string, unknown> }[]) => {
      const row = el('div', 'p-presets');
      row.append(el('span', 'p-presets-label', label));
      for (const pr of list) {
        const b = el('button', 'p-btn p-small', pr.name);
        b.title = pr.title;
        b.addEventListener('click', () => this.store.setMany(pr.values as never));
        row.append(b);
        this.refreshers.push(() => b.classList.toggle('on', profileActive(pr.values as never, this.store.values)));
      }
      wrap.append(row);
    };
    mk('Profiles', CAMERA_PROFILES);
    mk(
      'Old presets',
      CAMERA_PRESETS.map((p) => ({
        ...p,
        title: `The old game's ${p.name} camera, at its own soldier scale: height ${p.values.camHeight}, distance ${p.values.camBack}, lens ${p.values.camLens}°, turn ${p.values.camTurn}°`,
      })),
    );
    return wrap;
  }

  private row(p: Param): HTMLElement {
    if (p.kind === 'range') return this.rangeRow(p);
    if (p.kind === 'choice') return this.choiceRow(p);
    return this.toggleRow(p);
  }

  private resetBtn(p: Param): HTMLButtonElement {
    const b = el('button', 'p-reset', '↺');
    b.title = 'Reset to the start value';
    b.addEventListener('click', () => this.store.reset(p.key));
    return b;
  }

  private label(p: Param): HTMLElement {
    const l = el('span', 'p-label', p.label);
    l.title = p.source;
    return l;
  }

  private rangeRow(p: RangeParam): HTMLElement {
    const row = el('div', 'p-row');
    const top = el('div', 'p-top');
    const val = el('input', 'p-val');
    val.type = 'text';
    val.inputMode = 'decimal';
    val.spellcheck = false;
    const unit = el('span', 'p-unit', p.unit);
    const reset = this.resetBtn(p);
    top.append(this.label(p), val, unit, reset);
    const slider = el('input', 'p-slider');
    slider.type = 'range';
    slider.min = String(p.min);
    slider.max = String(p.max);
    slider.step = String(p.step);
    const note = el('div', 'p-sub');
    row.append(top, slider, note);

    const current = () => this.store.num(p.key);
    const refresh = () => {
      const raw = this.store.get(p.key);
      const v = current();
      if (document.activeElement !== val) val.value = raw === null ? `auto ${fmt(p, v)}` : fmt(p, v);
      if (document.activeElement !== slider) slider.value = String(v);
      const isStart = raw === p.start || (typeof raw === 'number' && typeof p.start === 'number' && Math.abs(raw - p.start) < 1e-9);
      reset.classList.toggle('changed', !isStart);
      const n = p.note ? p.note(this.store.values) : '';
      note.textContent = n;
      note.hidden = !n;
    };
    slider.addEventListener('input', () => this.store.set(p.key, parseFloat(slider.value)));
    // The box saves only what was typed into it: leaving it untouched keeps the exact value, not its rounding.
    let edited = false;
    val.addEventListener('input', () => {
      edited = true;
    });
    const commit = () => {
      if (edited) {
        const text = val.value.trim().toLowerCase();
        if (p.auto && (text === '' || text.startsWith('auto'))) this.store.set(p.key, null);
        else {
          const n = parseFloat(text.replace(',', '.'));
          if (Number.isFinite(n)) this.store.set(p.key, n);
        }
      }
      edited = false;
      refresh();
    };
    val.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        commit();
        val.blur();
      } else if (e.key === 'Escape') {
        edited = false;
        val.blur();
      }
      e.stopPropagation();
    });
    val.addEventListener('blur', commit);
    val.addEventListener('focus', () => val.select());
    this.refreshers.push(refresh);
    refresh();
    return row;
  }

  private choiceRow(p: ChoiceParam): HTMLElement {
    const row = el('div', 'p-row');
    const top = el('div', 'p-top');
    const seg = el('div', 'p-seg');
    const buttons = p.options.map((o) => {
      const b = el('button', 'p-segbtn', o.label);
      b.addEventListener('click', () => this.store.set(p.key, o.value));
      seg.append(b);
      return b;
    });
    top.append(this.label(p), this.resetBtn(p));
    row.append(top, seg);
    const refresh = () => {
      const v = this.store.get(p.key);
      p.options.forEach((o, i) => buttons[i].classList.toggle('on', o.value === v));
      (top.lastChild as HTMLElement).classList.toggle('changed', v !== p.start);
    };
    this.refreshers.push(refresh);
    refresh();
    return row;
  }

  private toggleRow(p: ToggleParam): HTMLElement {
    const row = el('div', 'p-row');
    const top = el('div', 'p-top');
    const lab = el('label', 'p-check');
    const box = el('input');
    box.type = 'checkbox';
    lab.append(box, this.label(p));
    const reset = this.resetBtn(p);
    top.append(lab, reset);
    row.append(top);
    box.addEventListener('change', () => this.store.set(p.key, box.checked));
    const refresh = () => {
      box.checked = this.store.get(p.key) === true;
      reset.classList.toggle('changed', this.store.get(p.key) !== p.start);
    };
    this.refreshers.push(refresh);
    refresh();
    return row;
  }
}
