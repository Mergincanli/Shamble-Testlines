// Keyboard and mouse. Keys are read by position (KeyboardEvent.code), so WASD sits in the same place on any
// layout. The page's own scrolling, middle-click scrolling and context menu are kept out of the way.

/** The key that aims down sights, beside the right button. */
export const AIM_KEY = 'KeyQ';

export class Input {
  readonly keys = new Set<string>();
  /** Key presses since the last simulation step read them, so a short tap between steps is not lost. */
  private pressed = new Set<string>();
  /** Key releases since the last simulation step read them. */
  private released = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  /** Cursor in normalised device coordinates (-1..1, y up), over the canvas. */
  ndcX = 0;
  ndcY = 0;
  buttons = 0;
  /** False while the cursor is off the view (over the panel or outside the window). */
  over = true;
  private turnDX = 0;
  private lastX: number | null = null;
  private firePressed = false;
  private aimPressed = false;
  private onKeyHandlers: ((code: string, key: string) => void)[] = [];
  private onFocusLossHandlers: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    const typing = () => {
      const a = document.activeElement;
      return a instanceof HTMLInputElement && a.type === 'text' ? true : a instanceof HTMLTextAreaElement;
    };
    window.addEventListener('keydown', (e) => {
      if (typing()) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        // Q aims down sights as well as the right button (in Firefox, Shift + right click always opens the
        // browser's own menu, and Shift is the sprint key).
        if (e.code === AIM_KEY) this.aimPressed = true;
        for (const h of this.onKeyHandlers) h(e.code, e.key);
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    // Losing focus (another window, another tab) lets go of everything, presses included.
    const letGo = () => {
      this.keys.clear();
      this.buttons = 0;
      this.firePressed = false;
      this.aimPressed = false;
      this.pressed.clear();
      this.released.clear();
      for (const h of this.onFocusLossHandlers) h();
    };
    window.addEventListener('blur', letGo);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) letGo();
    });
    // No browser menu on a right click anywhere on the page (text fields keep theirs), as the old game did.
    document.addEventListener('contextmenu', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      const r = canvas.getBoundingClientRect();
      this.ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.ndcY = -((e.clientY - r.top) / r.height) * 2 + 1;
      // Chorded buttons (a second button pressed while one is held) arrive as moves, not downs.
      if (e.buttons & 1 && !(this.buttons & 1)) this.firePressed = true;
      if (e.buttons & 2 && !(this.buttons & 2)) this.aimPressed = true;
      this.buttons = e.buttons;
      // The turn is measured from the cursor's own positions, which every browser reports the same way.
      if (this.buttons & 4 && this.lastX !== null) this.turnDX += e.clientX - this.lastX;
      this.lastX = e.clientX;
    });
    canvas.addEventListener('pointerdown', (e) => {
      // Middle button: no autoscroll. Any button: the canvas takes focus away from panel controls.
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      this.buttons = e.buttons;
      this.lastX = e.clientX;
      if (e.button === 0) this.firePressed = true;
      if (e.button === 2) this.aimPressed = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    });
    canvas.addEventListener('pointerenter', () => {
      this.over = true;
    });
    canvas.addEventListener('pointerleave', () => {
      // While a button is held the pointer stays captured, so a drag past the edge still counts as on the view.
      if (!this.buttons) this.over = false;
    });
    canvas.addEventListener('pointerup', (e) => {
      this.buttons = e.buttons;
    });
    canvas.addEventListener('pointercancel', () => {
      this.buttons = 0;
    });
    // A release outside the view (or one the view misses at its very edge) still counts.
    window.addEventListener('pointerup', (e) => {
      this.buttons = e.buttons;
    });
    window.addEventListener('mouseup', (e) => {
      this.buttons = e.buttons;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault();
    });
    canvas.addEventListener('auxclick', (e) => e.preventDefault());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  /** True if the key went down since the last call for that key (consumes it). */
  takePress(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  /** The left button is held on the view. */
  fireHeld(): boolean {
    return (this.buttons & 1) !== 0;
  }

  /** True if the left button went down since the last call (consumes it). */
  takeFirePress(): boolean {
    const p = this.firePressed;
    this.firePressed = false;
    return p;
  }

  /** The right button is held on the view, or the aim key. */
  aimHeld(): boolean {
    return (this.buttons & 2) !== 0 || this.keys.has(AIM_KEY);
  }

  /** Called when the page loses focus or is hidden. */
  onFocusLoss(fn: () => void) {
    this.onFocusLossHandlers.push(fn);
  }

  /** True if the right button went down since the last call (consumes it). */
  takeAimPress(): boolean {
    const p = this.aimPressed;
    this.aimPressed = false;
    return p;
  }

  /** True if the key came up since the last call for that key (consumes it). */
  takeRelease(code: string): boolean {
    const had = this.released.has(code);
    this.released.delete(code);
    return had;
  }

  /** Mouse travel in pixels while the middle button was held, since the last call. */
  takeTurn(): number {
    const d = this.turnDX;
    this.turnDX = 0;
    return d;
  }

  onKey(fn: (code: string, key: string) => void) {
    this.onKeyHandlers.push(fn);
  }
}
