// =========================================================================================
// Gravity: un pozo de gravedad dibujado con puntos, que se altera a tu paso
// =========================================================================================
//
// Un experimento de VERTIK. Una tela de puntos negros sobre rosa, vista en ángulo, con un
// solo agujero: los anillos se encogen y caen sin parar hacia él, y al llegar, la tela se
// pliega sobre sí misma en una garganta por la que se pierden.
//
//   well.js  → el pozo: los puntos, su shader, las ondas y la masa del cursor
//   sound.js → el sonido: el fondo, la caída sin fin y el impacto
//   share.js → compartir una foto
//   main.js  → el escenario, el agujero, la inclinación, el zoom y los modos (este archivo)
//
// Lo que hacemos nosotros:
//   - el agujero sigue al cursor, con pereza (con el dedo, casi sin resistencia), y se
//     queda donde lo dejes; al moverse, la tela se inclina hacia donde va;
//   - el cursor es una masa: hunde la tela donde está, atrae los puntos y deja una estela;
//   - cada toque o clic lanza una onda grande, que suena a impacto;
//   - manteniendo pulsado, todo se acerca (un zoom con el centro en el agujero).
//
// Dos modos, con «Prev» y «Next» en el pie, las flechas del teclado o la dirección (#wire):
// el de siempre, en rosa, y «wire», siempre el último, para ver cómo está hecho.

import * as THREE from 'three';
import { createWell, WELL_TILT, INFO } from './well.js';
import { createSound } from './sound.js';
import { setupShare } from './share.js';
import '../style.css';

// Los colores: el rosa y el negro, y los del modo wire (como en vertikis).
const PINK = '#ef5a86';
const INK = '#0d0d0d';
const WIRE_PAPER = '#eeeeee';
const WIRE_LINE = '#333333';

// Qué parte del lado corto de la pantalla ocuparía un radio de 1.
const FILL = 0.7;
// Dónde puede empezar el agujero (en partes de media pantalla, alrededor del centro) y
// cuánto sube el pozo sobre él (la garganta cuelga por debajo: que quepa).
const OFFSET = 0.35;
const LIFT = 0.3;

// El giro, muy lento (radianes por segundo): lo que manda es la caída.
const SPIN = -0.12;

// El agujero sigue al cursor con un muelle: hasta dónde se deja llevar, lo fuerte que tira
// y el rozamiento (con este, frena sin rebotar), y hasta dónde puede irse. Con el dedo,
// casi sin resistencia.
const FOLLOW = 0.6;
const PULL = 4;
const DRAG = 4.4;
const ROAM = 0.85;
const TOUCH = { follow: 0.95, pull: 40, drag: 12.6 };

// Al seguir al cursor, la tela se inclina hacia donde va: cuánto por unidad de velocidad
// (radianes) y como mucho cuánto.
const LEAN = 0.35;
const LEAN_MAX = 0.4;

// El zoom al mantener pulsado: cuánto se acerca por segundo, hasta cuánto, lo que tarda en
// volver al soltar y lo que espera antes (para poder compartirlo; con el ratón encima de
// los botones, no vuelve).
const ZOOM = 0.9;
const ZOOM_MAX = 5;
const ZOOM_BACK = 0.35;
const ZOOM_HOLD = 1.5;

// La estela del cursor: lo deprisa que tiene que ir (pantallas por segundo), cada cuánto
// deja una onda (segundos) y su fuerza (la de un toque es 1).
const WAKE_SPEED = 0.3;
const WAKE_GAP = 0.25;
const WAKE_STRENGTH = 0.12;

const canvas = document.querySelector('[data-gravity]');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
// Cámara con poca perspectiva (un ángulo de visión cerrado, mirando desde lejos).
const FOV = 18;
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
// La mitad del ancho y del alto de lo que se ve (en radios).
const half = { width: 1, height: 1 };

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  const short = 1 / FILL;
  half.width = w < h ? short : (short * w) / h;
  half.height = w < h ? (short * h) / w : short;
  camera.aspect = w / h;
  camera.position.z = half.height / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

// El pozo.
const well = createWell({ ink: INK });
well.object.visible = true;
scene.add(well.object);

// Dónde está el agujero y a qué velocidad va (en partes de media pantalla), y su sitio de
// partida (desde donde sigue al cursor): al abrir, uno al azar.
const random = () => (Math.random() * 2 - 1) * OFFSET;
let home = { x: random(), y: random() };
const hole = { x: home.x, y: home.y, vx: 0, vy: 0 };

// Los modos: el de siempre y «wire», siempre el último.
const MODES = ['well', 'wire'];
let mode = MODES[0];
const notes = document.querySelector('[data-notes]');
if (notes) {
  notes.innerHTML = [
    'GRAVITY · WIRE',
    `${INFO.rings} ANILLOS · R ${INFO.outer}`,
    `POZO ${INFO.depth} · (R₀/R)^1,4`,
    `GARGANTA ${INFO.throat} DEL CAMINO`,
    `AGUJERO ${INFO.hole} · MUELLE + ROZAMIENTO`,
    'ONDAS + MASA DEL CURSOR',
    'VERTIK.NET',
  ]
    .map((row) => `<div>${row}</div>`)
    .join('');
}
function setMode(name) {
  mode = MODES.includes(name) ? name : MODES[0];
  const wire = mode === 'wire';
  renderer.setClearColor(wire ? WIRE_PAPER : PINK);
  well.setInk(wire ? WIRE_LINE : INK);
  if (notes) notes.hidden = !wire;
  // El modo, en <html>: style.css cambia los colores de la página.
  document.documentElement.dataset.mode = mode;
  const hash = mode === MODES[0] ? '' : `#${mode}`;
  if (location.hash !== hash) history.replaceState(null, '', location.pathname + location.search + hash);
}
const stepMode = (by) => setMode(MODES[(MODES.indexOf(mode) + by + MODES.length) % MODES.length]);
document.querySelector('[data-mode-prev]')?.addEventListener('click', () => stepMode(-1));
document.querySelector('[data-mode-next]')?.addEventListener('click', () => stepMode(1));
window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  stepMode(e.key === 'ArrowLeft' ? -1 : 1);
});
const fromHash = () => setMode(decodeURIComponent(location.hash.slice(1)));
window.addEventListener('hashchange', fromHash);
fromHash();

// El sonido, con el altavoz de arriba a la derecha: apagado hasta que se pulsa.
const sound = createSound();
const soundButton = document.querySelector('[data-sound]');
soundButton?.addEventListener('click', () => {
  const playing = sound.toggle();
  soundButton.classList.toggle('is-on', playing);
  soundButton.setAttribute('aria-pressed', String(playing));
  soundButton.setAttribute('aria-label', playing ? 'Apagar el sonido' : 'Encender el sonido');
});

// Compartir: una foto, con el marco del color de la página.
setupShare(canvas, () => renderer.render(scene, camera), () =>
  mode === 'wire' ? { background: WIRE_PAPER, ink: WIRE_LINE } : { background: PINK, ink: INK },
);

// El cursor: dónde está (de -1 a 1 en cada eje; arriba, 1), o null si no está encima; lo
// deprisa que va (pantallas por segundo); y si es un dedo.
let pointer = null;
let pointerSpeed = 0;
let lastMove = null;
let touch = false;
const toScreen = (e) => {
  const rect = canvas.getBoundingClientRect();
  return { x: ((e.clientX - rect.left) / rect.width) * 2 - 1, y: 1 - ((e.clientY - rect.top) / rect.height) * 2 };
};
canvas.addEventListener('pointermove', (e) => {
  touch = e.pointerType === 'touch';
  pointer = toScreen(e);
  const now = performance.now();
  if (lastMove && now > lastMove.time) {
    const moved = Math.hypot(pointer.x - lastMove.x, pointer.y - lastMove.y) / 2;
    pointerSpeed = moved / ((now - lastMove.time) / 1000);
  }
  lastMove = { x: pointer.x, y: pointer.y, time: now };
});
canvas.addEventListener('pointerleave', () => {
  pointer = null;
});

// Pulsar: una onda desde ahí, que suena a impacto; y mientras se mantiene, el zoom.
let pressed = false;
let releasedAt = -Infinity;
let overTools = false;
canvas.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary) return;
  pressed = true;
  const at = toScreen(e);
  well.ripple(at.x, at.y, camera);
  sound.impact(at.x);
});
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  canvas.addEventListener(type, () => {
    if (pressed) releasedAt = performance.now();
    pressed = false;
  });
}
const tools = document.querySelector('.tools');
tools?.addEventListener('pointerenter', () => {
  overTools = true;
});
tools?.addEventListener('pointerleave', () => {
  overTools = false;
});

// Cada fotograma.
let time = 0;
let angle = 0;
let zoom = 1;
let lastWake = 0;
let last = performance.now();
renderer.setAnimationLoop((now) => {
  // Si la pestaña estuvo escondida, dt sería enorme: lo limitamos.
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  time += dt;
  angle += SPIN * dt;

  // El agujero: el muelle tira de él hacia un trozo del camino hacia el cursor, y el
  // rozamiento lo frena. Sin cursor, nada tira: frena y se queda donde esté.
  if (!pointer) home = { x: hole.x, y: hole.y };
  const follow = touch ? TOUCH.follow : FOLLOW;
  const pull = touch ? TOUCH.pull : PULL;
  const drag = touch ? TOUCH.drag : DRAG;
  const goal = pointer ? { x: home.x + (pointer.x - home.x) * follow, y: home.y + (pointer.y - home.y) * follow } : home;
  for (const axis of ['x', 'y']) {
    const target = Math.max(-ROAM, Math.min(ROAM, goal[axis]));
    const v = `v${axis}`;
    hole[v] += (pull * (target - hole[axis]) - drag * hole[v]) * dt;
    hole[axis] += hole[v] * dt;
  }
  well.object.position.set(hole.x * half.width, hole.y * half.height + half.height * LIFT, 0);
  // La inclinación: hacia donde se mueve el agujero, sobre la del ángulo de siempre.
  const lean = (v) => Math.max(-LEAN_MAX, Math.min(LEAN_MAX, v));
  well.object.rotation.set(WELL_TILT + lean(-hole.vy * LEAN), lean(hole.vx * LEAN), 0);

  // El zoom: pulsado, se acerca; suelto, espera un momento (o, con el ratón en los
  // botones, se queda) y vuelve.
  const holding = overTools || (now - releasedAt) / 1000 < ZOOM_HOLD;
  if (pressed) zoom = Math.min(ZOOM_MAX, zoom + ZOOM * dt);
  else if (!holding) zoom += (1 - zoom) * Math.min(1, dt / ZOOM_BACK);
  well.object.scale.setScalar(zoom);

  // La masa del cursor, y su estela al moverse.
  well.setCursor(pointer ? pointer.x : null, pointer ? pointer.y : null, camera);
  if (pointer && pointerSpeed > WAKE_SPEED && time - lastWake > WAKE_GAP) {
    lastWake = time;
    well.ripple(pointer.x, pointer.y, camera, WAKE_STRENGTH);
  }
  well.update(dt, angle, renderer.getPixelRatio(), camera.position.z, Math.min(canvas.clientWidth, canvas.clientHeight));

  // El sonido: lo cerca que está el cursor del agujero (en pantalla) y el zoom.
  const near = pointer ? Math.max(0, 1 - Math.hypot(pointer.x - hole.x, pointer.y - hole.y) / 0.6) : 0;
  sound.update(dt, near, zoom);
  pointerSpeed *= Math.exp(-dt * 10);

  renderer.render(scene, camera);
});
