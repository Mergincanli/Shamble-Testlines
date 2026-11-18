// A small readout and the stamina bar. The cursor is the system's crosshair, so aiming has no extra lag.

export class Hud {
  private readout: HTMLDivElement;
  private stamina: HTMLDivElement;
  private staminaFill: HTMLDivElement;
  private ammo: HTMLDivElement;
  private ammoText: HTMLDivElement;
  private reloadBar: HTMLDivElement;
  private reloadFill: HTMLDivElement;
  private reloadWindow: HTMLDivElement;
  private note: HTMLDivElement;
  private noteLife = 0;
  private lastName = '';
  private lastAmmo = '';
  private frames = 0;
  private fpsTime = 0;
  private fps = 0;
  private lastText = '';

  constructor() {
    this.readout = document.createElement('div');
    this.readout.id = 'readout';
    this.stamina = document.createElement('div');
    this.stamina.id = 'stamina';
    this.staminaFill = document.createElement('div');
    this.stamina.append(this.staminaFill);
    this.ammo = document.createElement('div');
    this.ammo.id = 'ammo';
    this.ammoText = document.createElement('div');
    this.reloadBar = document.createElement('div');
    this.reloadBar.className = 'reload';
    this.reloadFill = document.createElement('div');
    this.reloadFill.className = 'fill';
    this.reloadWindow = document.createElement('div');
    this.reloadWindow.className = 'window';
    // The window sits on top of the fill, so it stays visible as the fill moves through it.
    this.reloadBar.append(this.reloadFill, this.reloadWindow);
    this.note = document.createElement('div');
    this.note.className = 'note';
    this.ammo.append(this.ammoText, this.reloadBar, this.note);
    document.body.append(this.readout, this.stamina, this.ammo);
  }

  /**
   * Gun name, rounds left of the magazine, and the reload's progress (0..1), or -1 when not reloading; the active
   * reload's window (shares of the reload) and this reload's tap so far.
   */
  updateGun(
    dt: number,
    name: string,
    ammo: number,
    mag: number,
    reload: number,
    ready: boolean,
    windowFrom: number,
    windowTo: number,
    tap: '' | 'perfect' | 'miss',
    aiming = false,
  ) {
    this.reloadWindow.style.left = `${(windowFrom * 100).toFixed(1)}%`;
    this.reloadWindow.style.width = `${(Math.max(0, Math.min(1, windowTo) - windowFrom) * 100).toFixed(1)}%`;
    this.reloadWindow.classList.toggle('missed', tap === 'miss');
    // A gun change clears the note; otherwise it fades after a moment, keeping its colour while it fades.
    if (name !== this.lastName) {
      this.lastName = name;
      this.noteLife = 0;
      this.note.classList.remove('show');
    }
    if (this.noteLife > 0) {
      this.noteLife -= dt;
      if (this.noteLife <= 0) this.note.classList.remove('show');
    }
    const text = `${name}  ${ammo} / ${mag}${reload >= 0 ? '  reloading' : ready ? '' : '  not ready'}${aiming ? '  · aiming' : ''}`;
    if (text !== this.lastAmmo) {
      this.ammoText.textContent = text;
      this.lastAmmo = text;
    }
    this.reloadBar.classList.toggle('show', reload >= 0);
    if (reload >= 0) this.reloadFill.style.transform = `scaleX(${reload.toFixed(3)})`;
  }

  /** Show the result of an active-reload tap for a moment. */
  activeTap(result: 'perfect' | 'miss') {
    this.note.textContent = result === 'perfect' ? 'Perfect reload' : 'Missed: normal reload';
    this.note.className = `note show ${result}`;
    this.noteLife = 0.9;
  }

  update(dt: number, speed: number, feet: number, rate: number, stamina: number, locked: boolean, staminaOn: boolean) {
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
    }
    const text = `${speed.toFixed(2)} m/s · feet ${feet.toFixed(2)} m · ${rate} steps/s · ${this.fps} fps`;
    if (text !== this.lastText) {
      this.readout.textContent = text;
      this.lastText = text;
    }
    const show = staminaOn && (stamina < 0.999 || locked);
    this.stamina.classList.toggle('show', show);
    this.stamina.classList.toggle('locked', locked);
    this.staminaFill.style.transform = `scaleX(${stamina.toFixed(3)})`;
  }
}
