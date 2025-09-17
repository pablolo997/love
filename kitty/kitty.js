// Kitty Cat Zone — game session mode
// One-minute rounds, score at top center, spawn on Play. Feed hungry cats by DROPPING the fish on them.

// =========== DOM refs ===========
const STAGE = document.querySelector('.stage');
const fishSource = document.getElementById('fishSource');

// =========== Session / HUD ===========
const SESSION_MS = 30_000;
let gameRunning = false;
let sessionEndsAt = 0;
let score = 0;

// Build a small top-center HUD and Start button (injected so we don't touch HTML)
const hud = document.createElement('div');
hud.id = 'gameHud';
Object.assign(hud.style, {
  position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 1100,
  display: 'flex', alignItems: 'center', gap: '10px',
  background: 'rgba(255,255,255,.25)', backdropFilter: 'blur(6px)',
  border: '1px solid rgba(0,0,0,.12)', borderRadius: '999px', padding: '6px 12px'
});

const startBtn = document.createElement('button');
startBtn.id = 'startSessionBtn';
startBtn.textContent = 'Play';
Object.assign(startBtn.style, { border: 'none', borderRadius: '999px', padding: '6px 10px', cursor: 'pointer', background: 'white' });

const scoreWrap = document.createElement('div');
scoreWrap.innerHTML = "Score: <strong id='scoreValue'>0</strong>";
const timeWrap = document.createElement('div');
timeWrap.innerHTML = "Time: <strong id='timeValue'>30</strong>";

hud.appendChild(startBtn);
hud.appendChild(scoreWrap);
hud.appendChild(timeWrap);
document.body.appendChild(hud);

const scoreValueEl = document.getElementById('scoreValue');
const timeValueEl = document.getElementById('timeValue');

function setScore(v){ score = v; scoreValueEl.textContent = String(score); }
function addScore(delta){ setScore(score + delta); }

function updateTimer(now){
  if (!gameRunning) return;
  const ms = Math.max(0, sessionEndsAt - now);
  const secs = Math.ceil(ms/1000);
  timeValueEl.textContent = String(secs);
  if (ms <= 0) endSession();
}

let unfedCount = 0;

function startSession(){
  // reset
  setScore(0);
  unfedCount = 0;

  // remove any previous banner
  const oldBanner = document.getElementById('resultBanner');
  if (oldBanner) oldBanner.remove();

  sessionEndsAt = performance.now() + SESSION_MS;
  gameRunning = true;
  spawnAccumulator = 0;
  // clear any existing cats
  for (let i = cats.length - 1; i >= 0; i--) {
    const c = cats[i];
    if (c.runner && c.runner.parentNode) c.runner.parentNode.removeChild(c.runner);
    cats.pop();
  }
  startBtn.disabled = true; startBtn.textContent = 'Good luck!';
}


function endSession(){
  gameRunning = false;
  // fade all cats out quickly and clear
  cats.forEach(c => {
    c.runner.style.transition = 'opacity .35s linear';
    c.runner.style.opacity = '0';
    setTimeout(() => c.runner.remove(), 400);
  });
  cats.length = 0;
  startBtn.disabled = false; startBtn.textContent = 'Play Again';
  showEndBanner();
}


startBtn.addEventListener('click', () => { if (!gameRunning) startSession(); });

function showEndBanner(){
  // Remove any existing banner
  const old = document.getElementById('resultBanner');
  if (old) old.remove();

  // Overlay container
  const overlay = document.createElement('div');
  overlay.id = 'resultBanner';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    display: 'grid',
    placeItems: 'center',
    zIndex: 1200,
    pointerEvents: 'none'
  });

  // Big, bold message
  const msgEl = document.createElement('div');
  Object.assign(msgEl.style, {
    fontWeight: '900',
    textAlign: 'center',
    fontSize: 'clamp(32px, 6vw, 84px)',
    padding: '12px 20px',
    textShadow: '0 2px 10px rgba(0,0,0,.18)'
  });

  let text = '';
  if (unfedCount === 0) {
    text = 'ALL KITTENS FED! PUURRRRFECT!!!';
    msgEl.style.background = 'linear-gradient(90deg,#ff9a9e,#fad0c4,#fcb69f,#ffe47b,#a1ffce,#85f7ff,#ff85f7)';
    msgEl.style.webkitBackgroundClip = 'text';
    msgEl.style.backgroundClip = 'text';
    msgEl.style.color = 'transparent';
  } else if (unfedCount <= 2) {
    text = 'EPIC!';
    msgEl.style.color = '#a855f7'; // purple
  } else if (unfedCount <= 5) {
    text = 'Nice';
    msgEl.style.color = '#ffd700'; // yellow
  } else if (unfedCount <= 10) {
    text = 'a lot of these kittens went hungry :( maybe try again?';
    msgEl.style.color = '#ff9800'; // orange
  } else {
    text = 'YOU LET THEM STARVE! YOU MONSTER! 😡';
    msgEl.style.color = '#ff1744'; // red
  }

  msgEl.textContent = text;
  overlay.appendChild(msgEl);
  document.body.appendChild(overlay);
}

// =========== Spawn/motion settings (rAF, like bubbles) ===========
const CONCURRENT_CATS   = 5;     // exact population while running
const SPEED_MIN_PX_S    = 120;
const SPEED_MAX_PX_S    = 320;   // wider variability on upper bound
const SPAWN_BAND_VH     = [20, 80];
const STOP_X_MIN = () => window.innerWidth * 0.15;
const STOP_X_MAX = () => window.innerWidth * 0.75;
const SPAWN_EVERY_MS = 600;      // pace out early spawns

// State
const cats = []; // items: { runner, x, speed, state, canStopAfter, stopX, hungryExpireAt, fadeUntil }
let lastT = performance.now();
let spawnAccumulator = 0;
let heldFish = null; // floating emoji while held

// Utils
const rand = (min, max) => Math.random() * (max - min) + min;

// Inject hungry red tint keyframes
(function injectHungryCSS(){
  const style = document.createElement('style');
  style.textContent = `@keyframes hungry-red {\n  0% { filter:none; }\n  100% { filter: sepia(1) saturate(6) hue-rotate(-20deg) brightness(1.05); }\n}`;
  document.head.appendChild(style);
})();

function makeRunner(yvh){
  const runner = document.createElement('div');
  runner.className = 'runner';
  runner.style.bottom = yvh + 'vh';
  runner.style.animation = 'none'; // JS-driven

  const img = document.createElement('img');
  img.className = 'kitty';
  img.alt = 'Silly walking kitty';
  img.src = 'kitty/kitty.png';

  const sh = document.createElement('span');
  sh.className = 'shadow';

  // desync antics so they don't bounce together
  const offset = Math.random() * 6; // matches antics period in CSS
  img.style.animationDelay = `-${offset}s`;
  sh.style.animationDelay  = `-${offset}s`;

  runner.appendChild(img);
  runner.appendChild(sh);
  STAGE.appendChild(runner);
  return runner;
}

function spawnCat(initial=false){
  const yvh    = rand(SPAWN_BAND_VH[0], SPAWN_BAND_VH[1]);
  const runner = makeRunner(yvh);
  const startX = window.innerWidth + (initial ? rand(0, window.innerWidth * 1.25) : 120);
  const speed  = rand(SPEED_MIN_PX_S, SPEED_MAX_PX_S);
  const stopX  = rand(STOP_X_MIN(), STOP_X_MAX());

  const cat = {
    runner, x: startX, speed,
    state: 'walking',
    canStopAfter: performance.now() + 1000,  // at least 1s before stopping
    stopX,
    hungryExpireAt: 0,
    fadeUntil: 0
  };
  runner.style.transform = `translate3d(${cat.x}px, 0, 0)`;
  cats.push(cat);
}

function removeCatAt(i){
  const cat = cats[i];
  if (!cat) return;
  if (cat.runner && cat.runner.parentNode) cat.runner.parentNode.removeChild(cat.runner);
  cats.splice(i,1);
  // maintain population only while game is running
  if (gameRunning) spawnCat(false);
}

function setHungry(cat){
  if (cat.state !== 'walking') return;
  cat.state = 'hungry';
  cat.speed = 0;
  const img = cat.runner.querySelector('.kitty');
  img.src = 'kitty/hungry_kitty.gif';
  // stop bounce and tint to red over 3s
  img.style.animation = 'hungry-red 3s linear forwards';
  const sh = cat.runner.querySelector('.shadow'); if (sh) sh.style.opacity = '0.85';
  cat.hungryExpireAt = performance.now() + 3000;
}

function setCrying(cat){
  if (cat.state !== 'hungry') return;
  cat.state = 'crying';
  const img = cat.runner.querySelector('.kitty');

  // Single crying asset
  img.src = 'kitty/crying.gif';
  img.style.animation = 'none';

  unfedCount++;
  addScore(-10);

  // Fade out and despawn shortly after
  cat.runner.style.transition = 'opacity 1.8s linear';
  cat.runner.style.opacity = '0';
  cat.fadeUntil = performance.now() + 1800;
}



function feedCat(cat){
  if (cat.state !== 'hungry') return false;
  cat.state = 'fed';
  addScore(+10);
  const img = cat.runner.querySelector('.kitty');
  // random celebratory gif
  const idx = Math.floor(Math.random() * 11) + 1; // 1..11
  const gifSrc = idx === 1 ? 'kitty/kitty.gif' : `kitty/kitty${idx}.gif`;
  img.src = gifSrc;
  // stop bounce, hide shadow, grow to 2x, fade out
  img.style.animation = 'none';
  const sh = cat.runner.querySelector('.shadow'); if (sh) sh.style.opacity = '0';
  img.style.transformOrigin = '50% 50%';
  img.style.willChange = 'transform';
  img.style.transition = 'transform 1s cubic-bezier(.22,.61,.36,1)';
  requestAnimationFrame(() => { img.style.transform = 'scale(2)'; });

  cat.runner.style.transition = 'opacity 2.4s linear';
  cat.runner.style.opacity = '0';
  cat.fadeUntil = performance.now() + 2400;
  return true;
}

function tick(now){
  const dt = (now - lastT) / 1000; // seconds
  lastT = now;

  // Update HUD timer
  updateTimer(now);

  // Spawn pacing while running
  if (gameRunning) {
    if (cats.length < CONCURRENT_CATS) {
      spawnAccumulator += (now - lastT); // using lastT updated above; instead, use a small fixed increment
    }
    // Simpler: try to spawn at most one per SPAWN_EVERY_MS
    if (!tick._lastSpawn || (now - tick._lastSpawn) >= SPAWN_EVERY_MS) {
      if (cats.length < CONCURRENT_CATS) { spawnCat(true); tick._lastSpawn = now; }
    }
  }

  for (let i = cats.length - 1; i >= 0; i--){
    const c = cats[i];

    if (c.state === 'walking'){
      // move left
      c.x -= c.speed * dt;
      c.runner.style.transform = `translate3d(${c.x}px, 0, 0)`;
      if (performance.now() >= c.canStopAfter && c.x <= c.stopX){
        setHungry(c);
      }
      // offscreen safety
      if (c.x < -300) { removeCatAt(i); continue; }
    }
    else if (c.state === 'hungry'){
      if (performance.now() >= c.hungryExpireAt){
        setCrying(c);
      }
    }
    else if (c.fadeUntil){
      if (performance.now() >= c.fadeUntil){ removeCatAt(i); continue; }
    }
  }

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);


// =========== Fish follower & feeding (drop to feed) ===========
let activePointerId = null;

function moveHeldFish(e){
  if (!heldFish || e.pointerId !== activePointerId) return;
  e.preventDefault(); // stop any scroll/gesture
  heldFish.style.left = e.clientX + 'px';
  heldFish.style.top  = e.clientY + 'px';
}

function tryFeedAt(x, y){
  // Find the first hungry cat under the pointer (top-most by DOM order)
  for (let i = cats.length - 1; i >= 0; i--) {
    const c = cats[i];
    if (c.state !== 'hungry') continue;
    const img = c.runner.querySelector('.kitty');
    const r = img.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom){
      return feedCat(c);
    }
  }
  return false;
}

function cleanupDrag(){
  document.removeEventListener('pointermove', moveHeldFish);
  document.removeEventListener('pointerup', releaseFish);
  document.removeEventListener('pointercancel', releaseFish);
  activePointerId = null;
}

function releaseFish(e){
  if (!heldFish || e.pointerId !== activePointerId) return;
  e.preventDefault();
  if (gameRunning) tryFeedAt(e.clientX, e.clientY);
  heldFish.remove();
  heldFish = null;
  cleanupDrag();
}

fishSource.addEventListener('pointerdown', (e) => {
  if (!gameRunning) return;
  e.preventDefault();

  activePointerId = e.pointerId;
  // keep all subsequent pointer events flowing even when finger leaves the element
  fishSource.setPointerCapture?.(e.pointerId);

  heldFish = document.createElement('span');
  heldFish.textContent = '🐟';
  heldFish.className = 'held-fish';
  heldFish.style.left = e.clientX + 'px';
  heldFish.style.top  = e.clientY + 'px';
  document.body.appendChild(heldFish);

  document.addEventListener('pointermove', moveHeldFish,   { passive: false });
  document.addEventListener('pointerup',   releaseFish,    { passive: false });
  document.addEventListener('pointercancel', releaseFish,  { passive: false });

  // If the browser ever drops capture, treat it like a release so we don’t get stuck.
  fishSource.addEventListener('lostpointercapture', releaseFish, { once: true });
});

