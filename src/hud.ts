// A small readout and the stamina bar. The cursor is the system's crosshair, so aiming has no extra lag.

export class Hud {
  private readout: HTMLDivElement;
  private stamina: HTMLDivElement;
  private staminaFill: HTMLDivElement;
  private ammo: HTMLDivElement;
  private ammoText: HTMLDivElement;
  private reloadBar: HTMLDivElement;
  private reloadFill: HTMLDivElement;
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
    this.reloadBar.append(this.reloadFill);
    this.ammo.append(this.ammoText, this.reloadBar);
    document.body.append(this.readout, this.stamina, this.ammo);
  }

  /** Gun name, rounds left of the magazine, and the reload's progress (0..1), or -1 when not reloading. */
  updateGun(name: string, ammo: number, mag: number, reload: number, ready: boolean) {
    const text = `${name}  ${ammo} / ${mag}${reload >= 0 ? '  reloading' : ready ? '' : '  not ready'}`;
    if (text !== this.lastAmmo) {
      this.ammoText.textContent = text;
      this.lastAmmo = text;
    }
    this.reloadBar.classList.toggle('show', reload >= 0);
    if (reload >= 0) this.reloadFill.style.transform = `scaleX(${reload.toFixed(3)})`;
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
