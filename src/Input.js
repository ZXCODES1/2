export class Input {
  constructor() {
    this._keys     = {};
    this._pressed  = {};
    this._released = {};

    // Touch virtual buttons
    this.touch = { left: false, right: false, jump: false, shoot: false };
    this._jumpTap  = false;
    this._shootTap = false;

    window.addEventListener('keydown', e => {
      if (!this._keys[e.code]) this._pressed[e.code] = true;
      this._keys[e.code] = true;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))
        e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this._keys[e.code]    = false;
      this._released[e.code] = true;
    });

    this._initTouch();
  }

  _initTouch() {
    const bind = (id, prop) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', e => { e.preventDefault(); this.touch[prop] = true; if(prop==='jump') this._jumpTap=true; if(prop==='shoot') this._shootTap=true; }, { passive: false });
      el.addEventListener('touchend',   e => { e.preventDefault(); this.touch[prop] = false; }, { passive: false });
      el.addEventListener('touchcancel',e => { e.preventDefault(); this.touch[prop] = false; }, { passive: false });
    };
    bind('btn-left',  'left');
    bind('btn-right', 'right');
    bind('btn-jump',  'jump');
    bind('btn-shoot', 'shoot');
  }

  clearFrame() {
    this._pressed  = {};
    this._released = {};
    this._jumpTap  = false;
    this._shootTap = false;
    this._dashTap  = false;
    this._confirmTap = false;
  }

  isDown(code)    { return !!this._keys[code]; }
  wasPressed(code){ return !!this._pressed[code]; }
  wasReleased(code){ return !!this._released[code]; }

  left()  { return this.isDown('ArrowLeft') || this.isDown('KeyA') || this.touch.left; }
  right() { return this.isDown('ArrowRight')|| this.isDown('KeyD') || this.touch.right; }

  jump()       { return this.isDown('Space') || this.isDown('ArrowUp') || this.isDown('KeyW') || this.isDown('KeyX') || this.touch.jump; }
  jumpPressed(){ return this.wasPressed('Space') || this.wasPressed('ArrowUp') || this.wasPressed('KeyW') || this.wasPressed('KeyX') || this._jumpTap; }
  jumpReleased(){ return this.wasReleased('Space') || this.wasReleased('ArrowUp') || this.wasReleased('KeyW') || this.wasReleased('KeyX'); }

  shoot()       { return this.isDown('KeyZ') || this.isDown('KeyJ') || this.isDown('ControlLeft') || this.touch.shoot; }
  shootPressed(){ return this.wasPressed('KeyZ') || this.wasPressed('KeyJ') || this.wasPressed('ControlLeft') || this._shootTap; }

  dash()  { return this.wasPressed('ShiftLeft') || this.wasPressed('ShiftRight') || this._dashTap; }
  pause() { return this.wasPressed('Escape') || this.wasPressed('KeyP'); }
  confirm(){ return this.wasPressed('Enter') || this.wasPressed('Space') || this.wasPressed('KeyZ') || this._jumpTap || this._shootTap || this._confirmTap; }
}
