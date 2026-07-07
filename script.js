// Teapot Labs — pour-line animation.
// One teapot, a conveyor of teacups. The pot rises into place, then loops:
// cups slide one place left, the pot tilts, tea streams into the cup at the
// pour mark, and filled cups drift on and fade out 3–4 places downstream.
(() => {
  const svg = document.getElementById('scene');
  if (!svg) return;

  const pot = document.getElementById('pot');
  const stream = document.getElementById('stream');
  const splash = document.getElementById('splash');
  const cupsLayer = document.getElementById('cups');
  const proto = document.getElementById('cup-proto');
  const dress = svg.querySelector('.scene-dress');

  // Scene geometry (viewBox units). POUR_X sits under the spout tip when the
  // pot is tilted to POUR_ANGLE; the stream spans STREAM_TOP -> cup rim (434).
  const POUR_X = 483;
  const STREAM_TOP = 250;
  const STREAM_LEN = 184;
  const TRACK_Y = 480;
  const SLOT_W = 150;
  const POUR_ANGLE = -24;
  const POT_INTRO = { x: 500, y: 310, r: 0 };
  const POT_REST = { x: 600, y: 268, r: -8 };

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const lerp = (a, b, k) => a + (b - a) * k;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t;

  function tween(dur, ease, step) {
    return new Promise((done) => {
      const t0 = performance.now();
      (function frame(now) {
        const k = Math.min(1, (now - t0) / dur);
        step(ease(k));
        if (k < 1) requestAnimationFrame(frame);
        else done();
      })(t0);
    });
  }

  // --- Teapot -------------------------------------------------------------
  const potState = { ...POT_INTRO };

  function renderPot() {
    pot.setAttribute(
      'transform',
      `translate(${potState.x} ${potState.y}) rotate(${potState.r})`
    );
  }

  function potTo(target, dur) {
    const from = { ...potState };
    const to = { ...from, ...target };
    return tween(dur, easeInOut, (k) => {
      potState.x = lerp(from.x, to.x, k);
      potState.y = lerp(from.y, to.y, k);
      potState.r = lerp(from.r, to.r, k);
      renderPot();
    });
  }

  // --- Cups ---------------------------------------------------------------
  // Slot 0 is the pour mark; negative slots queue in from the right, positive
  // slots drift left. Five cups show at once: ghosts at the ±2 edges fade
  // in/out, and cups are removed at slot 3.
  const cups = [];
  const xFor = (slot) => POUR_X - slot * SLOT_W;
  const opacityFor = (slot) =>
    slot >= 3 || slot <= -3 ? 0 : slot === 2 || slot === -2 ? 0.45 : 1;

  function renderCup(c) {
    c.el.setAttribute('transform', `translate(${c.x} ${TRACK_Y})`);
    c.el.setAttribute('opacity', c.opacity);
    c.tea.setAttribute('transform', `translate(0 ${46 - 40 * c.fill})`);
    c.top.setAttribute('opacity', Math.max(0, (c.fill - 0.55) / 0.45));
  }

  function spawnCup(slot, { x = xFor(slot), opacity = 0, fill = 0 } = {}) {
    const el = proto.cloneNode(true);
    el.removeAttribute('id');
    el.classList.add('cup');
    cupsLayer.appendChild(el);
    const cup = {
      el,
      slot,
      x,
      opacity,
      fill,
      tea: el.querySelector('.tea'),
      top: el.querySelector('.tea-top'),
    };
    renderCup(cup);
    cups.push(cup);
    return cup;
  }

  async function advance() {
    cups.forEach((c) => c.slot++);
    spawnCup(-2, { x: xFor(-3), opacity: 0 });
    const starts = cups.map((c) => ({ c, x: c.x, o: c.opacity }));
    await tween(950, easeInOut, (k) => {
      for (const { c, x, o } of starts) {
        c.x = lerp(x, xFor(c.slot), k);
        c.opacity = lerp(o, opacityFor(c.slot), k);
        renderCup(c);
      }
    });
    for (let i = cups.length - 1; i >= 0; i--) {
      if (cups[i].slot >= 3) {
        cups[i].el.remove();
        cups.splice(i, 1);
      }
    }
  }

  // --- Pouring ------------------------------------------------------------
  function setStream(scale, drop = 0) {
    stream.setAttribute(
      'transform',
      `translate(${POUR_X} ${STREAM_TOP + drop}) scale(1 ${Math.max(scale, 0.0001)})`
    );
  }

  async function pour(cup) {
    await potTo({ r: POUR_ANGLE }, 420);
    stream.style.opacity = 1;
    await tween(230, easeIn, (k) => setStream(k));
    splash.classList.add('on');
    await tween(880, easeInOut, (k) => {
      cup.fill = k;
      renderCup(cup);
    });
    splash.classList.remove('on');
    // Tail of the stream falls into the cup: top edge drops as it shrinks.
    await tween(300, easeIn, (k) => setStream(1 - k, STREAM_LEN * k));
    stream.style.opacity = 0;
    setStream(0);
    cup.el.classList.add('filled');
    await potTo({ r: POT_REST.r }, 420);
  }

  // --- Sequence -----------------------------------------------------------
  async function loop() {
    for (;;) {
      await advance();
      await wait(120);
      const target = cups.find((c) => c.slot === 0);
      if (target && target.fill === 0) await pour(target);
      await wait(260);
    }
  }

  async function intro() {
    renderPot();
    await wait(750);
    const move = potTo(POT_REST, 1150);
    setTimeout(() => dress.classList.add('show'), 350);
    await move;
    for (const s of [-1, -2]) {
      const c = spawnCup(s);
      tween(500, easeOut, (k) => {
        c.opacity = k * opacityFor(c.slot);
        renderCup(c);
      });
      await wait(140);
    }
    await wait(420);
    loop();
  }

  setStream(0);
  if (reduceMotion) {
    Object.assign(potState, POT_REST);
    renderPot();
    dress.classList.add('show');
    for (let s = -2; s <= 2; s++) {
      const c = spawnCup(s, { opacity: opacityFor(s), fill: s >= 0 ? 1 : 0 });
      if (s >= 0) c.el.classList.add('filled');
    }
  } else {
    intro();
  }
})();
