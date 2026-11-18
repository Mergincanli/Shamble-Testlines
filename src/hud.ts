// A small readout and the stamina bar. The cursor is the system's crosshair, so aiming has no extra lag.

export class Hud {
  private readout: HTMLDivElement;
  private stamina: HTMLDivElement;
  private staminaFill: HTMLDivElement;
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
    document.body.append(this.readout, this.stamina);
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
