// Keyboard and mouse. Keys are read by position (KeyboardEvent.code), so WASD sits in the same place on any
// layout. The page's own scrolling, middle-click scrolling and context menu are kept out of the way.

export class Input {
  readonly keys = new Set<string>();
  /** Key presses since the last simulation step read them, so a short tap between steps is not lost. */
  private pressed = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  /** Cursor in normalised device coordinates (-1..1, y up), over the canvas. */
  ndcX = 0;
  ndcY = 0;
  buttons = 0;
  private turnDX = 0;
  private onKeyHandlers: ((code: string) => void)[] = [];

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
        for (const h of this.onKeyHandlers) h(e.code);
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons = 0;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.keys.clear();
        this.buttons = 0;
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      const r = canvas.getBoundingClientRect();
      this.ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.ndcY = -((e.clientY - r.top) / r.height) * 2 + 1;
      // Chorded buttons (a second button pressed while one is held) arrive as moves, not downs.
      this.buttons = e.buttons;
      if (this.buttons & 4) this.turnDX += e.movementX || 0;
    });
    canvas.addEventListener('pointerdown', (e) => {
      // Middle button: no autoscroll. Any button: the canvas takes focus away from panel controls.
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      this.buttons = e.buttons;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      this.buttons = e.buttons;
    });
    canvas.addEventListener('pointercancel', () => {
      this.buttons = 0;
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

  /** Mouse travel in pixels while the middle button was held, since the last call. */
  takeTurn(): number {
    const d = this.turnDX;
    this.turnDX = 0;
    return d;
  }

  onKey(fn: (code: string) => void) {
    this.onKeyHandlers.push(fn);
  }
}
