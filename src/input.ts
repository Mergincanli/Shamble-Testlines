// Keyboard and mouse. Keys are read by position (KeyboardEvent.code), so WASD sits in the same place on any
// layout. The page's own scrolling, middle-click scrolling and context menu are kept out of the way.

/** The key that aims down sights (and the right button too, when it is set to aim). */
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
  private rightPressed = false;
  private rightReleased = false;
  private onKeyHandlers: ((code: string, key: string) => void)[] = [];
  private onFocusLossHandlers: (() => void)[] = [];
  private onMenuHandlers: (() => void)[] = [];

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
      this.rightPressed = false;
      this.rightReleased = false;
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
      // Firefox opens its own menu on Shift + right click whatever the page does, and the menu swallows the
      // let-go: the right button is dropped (with no let-go), so nothing fires or throws later by itself.
      if (e.shiftKey && /firefox/i.test(navigator.userAgent)) {
        this.buttons &= ~2;
        this.rightPressed = false;
        this.rightReleased = false;
        for (const h of this.onMenuHandlers) h();
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      const r = canvas.getBoundingClientRect();
      this.ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.ndcY = -((e.clientY - r.top) / r.height) * 2 + 1;
      // Chorded buttons (a second button pressed or let go while another is held) arrive as moves.
      this.setButtons(e.buttons);
      // The turn is measured from the cursor's own positions, which every browser reports the same way.
      if (this.buttons & 4 && this.lastX !== null) this.turnDX += e.clientX - this.lastX;
      this.lastX = e.clientX;
    });
    canvas.addEventListener('pointerdown', (e) => {
      // Middle button: no autoscroll. Any button: the canvas takes focus away from panel controls.
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
      this.setButtons(e.buttons);
      this.lastX = e.clientX;
      if (e.button === 0) this.firePressed = true;
      if (e.button === 2) this.rightPressed = true;
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
    canvas.addEventListener('pointerup', (e) => this.setButtons(e.buttons));
    // A cancelled pointer lets go of everything without counting as a let-go (so an aimed throw is dropped).
    canvas.addEventListener('pointercancel', letGo);
    // A release outside the view (or one the view misses at its very edge) still counts.
    window.addEventListener('pointerup', (e) => this.setButtons(e.buttons));
    window.addEventListener('mouseup', (e) => this.setButtons(e.buttons));
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault();
    });
    canvas.addEventListener('auxclick', (e) => e.preventDefault());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  }

  /** New button state: notes a left or right press, and a right let-go, so short clicks between steps count. */
  private setButtons(b: number) {
    if (b & 1 && !(this.buttons & 1)) this.firePressed = true;
    if (b & 2 && !(this.buttons & 2)) this.rightPressed = true;
    if (!(b & 2) && this.buttons & 2) this.rightReleased = true;
    this.buttons = b;
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

  /** The right button is held. */
  rightHeld(): boolean {
    return (this.buttons & 2) !== 0;
  }

  /** Called when the page loses focus or is hidden. */
  onFocusLoss(fn: () => void) {
    this.onFocusLossHandlers.push(fn);
  }

  /** Called when the browser forces its own menu open over the page (Firefox, Shift + right click). */
  onForcedMenu(fn: () => void) {
    this.onMenuHandlers.push(fn);
  }

  /** True if the right button went down since the last call (consumes it). */
  takeRightPress(): boolean {
    const p = this.rightPressed;
    this.rightPressed = false;
    return p;
  }

  /** True if the right button came up since the last call (consumes it). */
  takeRightRelease(): boolean {
    const p = this.rightReleased;
    this.rightReleased = false;
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
