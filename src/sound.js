// =========================================================================================
// El sonido: caer sin llegar nunca al fondo
// =========================================================================================
//
// Todo se genera aquí, con la Web Audio API: no hay archivos de audio.
//   - el FONDO: dos ondas muy graves, casi iguales (36 Hz), que laten despacio, por un
//     filtro que solo deja lo más grave. Se nota más que se oye, como la presión del pozo;
//   - la CAÍDA: un tono que baja sin parar y nunca llega abajo. Son seis notas a una octava
//     una de otra que bajan juntas; las de en medio suenan más y las de los extremos casi
//     nada, así que cuando la más grave se apaga, por arriba entra otra sin que se note
//     (la ilusión de Shepard). Va con los anillos: bajan a la vez que caen;
//   - el CURSOR, como una masa, tira del fondo: cerca del agujero, más grave y más presente;
//   - cada toque, un IMPACTO: un golpe muy grave que cae de tono, un estallido de ruido seco
//     y una cola de metal que resuena unos segundos; mientras, todo lo demás se aparta un
//     momento (baja y vuelve);
//   - con el ZOOM (manteniendo pulsado), todo baja y se cierra, como si te acercaras al
//     fondo.
//
// Los navegadores no dejan sonar nada sin que se toque algo: empieza con el botón de arriba.

// El fondo: su nota (Hz), cuánto se desafina la segunda onda y por dónde corta el filtro.
const BASE = 36;
const BEAT = 1.006;
const FILTER = 120;

// La caída: cuántas notas, la más grave posible (Hz), cuántas octavas baja por segundo y
// su volumen.
const VOICES = 6;
const LOWEST = 55;
const FALL = 0.035;
const FALL_VOLUME = 0.05;

// El impacto: su volumen, y cuánto baja todo lo demás mientras suena (0,3 = al 30 %).
const IMPACT_VOLUME = 0.9;
const IMPACT_DUCK = 0.3;

// Lo que baja el tono con el zoom (céntimos por cada vez su tamaño).
const ZOOM_PITCH = 200;

// Volumen general, y lo que tarda en entrar y en irse (segundos).
const VOLUME = 0.45;
const FADE = 2;

function random(a, b) {
  return a + Math.random() * (b - a);
}

export function createSound() {
  let ctx = null;
  let master = null;
  // Todo menos el impacto pasa por aquí: es lo que se aparta cuando suena.
  let bed = null;
  let noise = null;
  let lowpass = null;
  const tuned = [];
  // Las notas de la caída: su onda y su volumen.
  const voices = [];
  let fallPosition = 0;
  let on = false;

  function build() {
    ctx = new AudioContext();

    // El volumen general y, antes de los altavoces, un compresor: que nada sature.
    master = ctx.createGain();
    master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    master.connect(compressor).connect(ctx.destination);
    bed = ctx.createGain();
    bed.connect(master);

    // El fondo: las dos ondas graves por el filtro.
    lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = FILTER;
    lowpass.Q.value = 1.2;
    lowpass.connect(bed);
    for (const frequency of [BASE, BASE * BEAT]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = frequency;
      const level = ctx.createGain();
      level.gain.value = 0.6;
      osc.connect(level).connect(lowpass);
      osc.start();
      tuned.push(osc);
    }

    // La caída: las notas, cada una con su volumen (lo pone «update»).
    for (let k = 0; k < VOICES; k++) {
      const osc = ctx.createOscillator();
      const level = ctx.createGain();
      level.gain.value = 0;
      osc.connect(level).connect(bed);
      osc.start();
      tuned.push(osc);
      voices.push({ osc, level });
    }

    // Un segundo de ruido blanco, para el estallido del impacto.
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function start() {
    if (!ctx) build();
    ctx.resume();
    on = true;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(VOLUME, now + FADE);
  }

  function stop() {
    on = false;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + FADE / 2);
    // Cuando ya no suena, a dormir: que no gaste.
    setTimeout(() => !on && ctx.suspend(), (FADE / 2) * 1000 + 100);
  }

  // Un impacto, en el lado del toque (-1 a 1). Tres capas: un golpe grave que cae de 90 a
  // 28 Hz (por eso suena a golpe y no a nota) y se apaga en segundo y medio; un estallido
  // de ruido muy corto y apagado; y una cola de metal (las proporciones de una campana, 1,
  // 2,76, 5,40 y 8,93, sobre una nota grave) que resuena. Todo lo demás baja y vuelve.
  function impact(pan = 0) {
    if (!on) return;
    const now = ctx.currentTime;
    const out = ctx.createStereoPanner();
    out.pan.value = Math.max(-1, Math.min(1, pan)) * 0.6;
    out.connect(master);

    const boom = ctx.createOscillator();
    boom.frequency.setValueAtTime(90, now);
    boom.frequency.exponentialRampToValueAtTime(28, now + 0.9);
    const boomLevel = ctx.createGain();
    boomLevel.gain.setValueAtTime(0, now);
    boomLevel.gain.linearRampToValueAtTime(IMPACT_VOLUME, now + 0.008);
    boomLevel.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    boom.connect(boomLevel).connect(out);
    boom.start(now);
    boom.stop(now + 1.65);

    const crack = ctx.createBufferSource();
    crack.buffer = noise;
    const dull = ctx.createBiquadFilter();
    dull.type = 'lowpass';
    dull.frequency.value = 900;
    const crackLevel = ctx.createGain();
    crackLevel.gain.setValueAtTime(IMPACT_VOLUME * 0.5, now);
    crackLevel.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    crack.connect(dull).connect(crackLevel).connect(out);
    crack.start(now, random(0, 0.8));
    crack.stop(now + 0.15);

    const base = random(48, 62);
    [1, 2.76, 5.4, 8.93].forEach((ratio, k) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = base * ratio;
      const level = ctx.createGain();
      const decay = 3.2 / (k + 1);
      level.gain.setValueAtTime(0, now);
      level.gain.linearRampToValueAtTime((IMPACT_VOLUME * 0.25) / (k + 1), now + 0.01);
      level.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(level).connect(out);
      osc.start(now);
      osc.stop(now + decay + 0.05);
    });

    bed.gain.cancelScheduledValues(now);
    bed.gain.setValueAtTime(bed.gain.value, now);
    bed.gain.linearRampToValueAtTime(IMPACT_DUCK, now + 0.03);
    bed.gain.linearRampToValueAtTime(1, now + 2.2);
  }

  // Cada fotograma: «dt», lo cerca que está el cursor del agujero (0 lejos o sin cursor, 1
  // encima) y el zoom (1 = nada). Baja la caída, y el cursor y el zoom cambian el fondo.
  function update(dt, near = 0, zoom = 1) {
    if (!on) return;
    const now = ctx.currentTime;
    // La caída: todas las notas bajan; su sitio, de 0 a VOICES octavas sobre LOWEST, da la
    // vuelta al llegar abajo. El volumen, una campana: alto en medio, nada en los extremos.
    fallPosition = (fallPosition + FALL * dt) % 1;
    voices.forEach(({ osc, level }, k) => {
      const octave = (k + 1 - fallPosition) % VOICES;
      osc.frequency.setTargetAtTime(LOWEST * 2 ** octave, now, 0.02);
      const middle = (octave / VOICES) * 2 - 1;
      level.gain.setTargetAtTime(FALL_VOLUME * Math.exp(-middle * middle * 4) / zoom, now, 0.05);
    });
    // El cursor tira del fondo: más grave y más abierto cuanto más cerca del agujero.
    const cents = -near * 300 - (zoom - 1) * ZOOM_PITCH;
    for (const osc of tuned.slice(0, 2)) osc.detune.setTargetAtTime(cents, now, 0.1);
    lowpass.frequency.setTargetAtTime((FILTER * (1 + near)) / zoom, now, 0.1);
  }

  return {
    toggle: () => (on ? stop() : start(), on),
    update,
    impact,
  };
}
