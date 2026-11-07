// =========================================================================================
// El pozo: un pozo de gravedad dibujado con puntos
// =========================================================================================
//
// Sobre un rosa intenso, una tela de puntos negros vista en ángulo, con un solo agujero:
//   - el POZO: anillos concéntricos que se hunden cada vez más deprisa hacia el centro (por
//     el ángulo salen como elipses apiladas) y, al llegar al agujero, la tela se pliega
//     sobre sí misma hacia abajo, en una garganta estrecha por la que los anillos caen hasta
//     perderse. Los anillos no paran de caer; hacia fuera, los puntos se esparcen hasta
//     desaparecer, como un punteado a mano;
//   - lo que ALTERAMOS al pasar: el cursor es una masa pequeña que hunde la tela donde está
//     y atrae hacia sí los puntos de alrededor; al moverse, deja una estela de ondas
//     (main.js las lanza); y cada toque o clic lanza una onda grande, como una piedra en el
//     agua. Varias ondas a la vez se cruzan.
//
// Nació como un modo de sunburst; ahora es un experimento aparte.
//
// Y tres maneras más de verlo, sobre la misma forma (el mismo pozo, las mismas ondas y la
// misma masa del cursor: un trozo de shader común, SURFACE):
//   - GRID: la sábana del espacio-tiempo. Una malla polar, de círculos y radios, que se
//     hunde en el pozo y baja limpia por la garganta; los círculos caen sin parar;
//   - ORBIT: el disco de acreción. Partículas que giran alrededor del agujero, cada vez más
//     deprisa cuanto más cerca, y caen en espiral, con estela;
//   - y los puntos de siempre en otros colores (wire: main.js).
//
// Todo lo mueve un shader. Cada punto sabe en qué anillo está («u», de 0 al fondo de la
// garganta a 1 en el borde de fuera) y en qué ángulo; con el tiempo, u baja (cae) y, al
// llegar al fondo, vuelve a empezar por fuera. De ahí salen su radio y su altura, y luego
// se suman las ondas y lo que hace el cursor.

import * as THREE from 'three';

// El radio del agujero, en radios (lo que mide todo lo demás).
const HOLE = 0.25;

// La tela: hasta dónde llegan sus anillos (en radios: el recuadro mide unos 1,4 de alto),
// cuántos hay, lo hondo que es el pozo a la altura del agujero, y lo que caen los anillos
// por segundo (en partes del camino entero).
const OUTER = 5;
const RINGS = 80;
const DEPTH = 0.9;
const FALL = 0.04;
// La garganta: qué parte de los anillos está en ella (los de más abajo), lo estrecha que
// llega a ser (en partes del agujero) y lo que baja.
const THROAT = 0.14;
const NARROW = 0.55;
const THROAT_DEPTH = 1.4;
// Lo separados que van los puntos en cada anillo (en radios).
const SPACING = 0.03;
// El tamaño de cada punto (píxeles, a la distancia del plano) y cuánto se desvían de su
// anillo (en partes de su radio): un punteado, no una máquina.
const SIZE = 2.6;
const JITTER = 0.002;
// Qué parte del giro que le llega gira de verdad (poco: lo que manda es la caída).
const SPIN_SHARE = 0.15;
// En pantallas pequeñas, menos densidad (si no, los puntos se amontonan y queda casi negro):
// la de siempre desde DENSE_FROM píxeles de lado corto; por debajo, en proporción, hasta
// MIN_DENSITY. Y por debajo de 0,75, uno de cada dos anillos.
const DENSE_FROM = 700;
const MIN_DENSITY = 0.5;
// Lo inclinado que está, para verlo en ángulo (radianes; el de arriba, más lejos).
export const WELL_TILT = -1.0;

// Las ondas: cuántas a la vez como mucho, lo deprisa que se abren (radios por segundo),
// lo que tardan en apagarse (segundos), su altura (la de un toque; la estela, menos) y lo
// ancho de su frente.
const MAX_RIPPLES = 10;
const RIPPLE_SPEED = 1.4;
const RIPPLE_LIFE = 3;
const RIPPLE_HEIGHT = 0.22;
const RIPPLE_WIDTH = 0.35;

// La masa del cursor: lo que hunde la tela, lo ancho de su hoyo (radios), lo que atrae los
// puntos de alrededor (en partes de su distancia) y lo que tarda en aparecer o irse (s).
const MASS_DEPTH = 0.1;
const MASS_WIDTH = 0.5;
const MASS_PULL = 0.08;
const MASS_EASE = 0.25;

// La malla (grid), polar: cuántos círculos (caen hacia el agujero, como los anillos de
// puntos), cuántos radios, y en cuántos tramos se parte cada línea (más = más suave).
const GRID_RINGS = 26;
const GRID_SPOKES = 36;
const GRID_STEPS = 160;

// El disco (orbit): cuántas partículas, cuántos puntos de estela lleva cada una y lo
// separados que van (en partes del camino entero), lo que caen por segundo (también en
// partes del camino), lo que giran (cuanto más cerca, más: la velocidad de una órbita
// crece como 1 / r^1,5) y su tamaño.
const PARTICLES = 2600;
const TRAIL = 6;
const TRAIL_GAP = 0.004;
const ORBIT_FALL = 0.03;
const SWIRL = 9;
const PARTICLE_SIZE = 3;

// El trozo de shader común: el pozo (fuera de la garganta) y lo que hacemos nosotros (la
// masa del cursor y las ondas), para un punto «p» del plano a la altura «z».
const SURFACE = /* glsl */ `
  uniform vec4 ripples[${MAX_RIPPLES}];
  uniform vec3 mass;

  // El pozo: cada vez más hondo cuanto más cerca del agujero.
  float well(float r) {
    return -${DEPTH.toFixed(2)} * pow(${HOLE.toFixed(3)} / r, 1.4);
  }

  // Lo que hacemos nosotros: la masa del cursor atrae los puntos de alrededor y hunde la
  // tela donde está; y las ondas la suben y la bajan.
  vec3 disturb(vec2 p, float z) {
    vec2 toMass = mass.xy - p;
    float near = exp(-dot(toMass, toMass) / ${(MASS_WIDTH * MASS_WIDTH).toFixed(3)}) * mass.z;
    p += toMass * near * ${MASS_PULL.toFixed(2)};
    z -= near * ${MASS_DEPTH.toFixed(2)};
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 w = ripples[i];
      float front = length(p - w.xy) - w.z * ${RIPPLE_SPEED.toFixed(2)};
      float fade = exp(-w.z * ${(3 / RIPPLE_LIFE).toFixed(3)}) * w.w;
      z += ${RIPPLE_HEIGHT.toFixed(3)} * fade * exp(-pow(front / ${RIPPLE_WIDTH.toFixed(2)}, 2.0)) * cos(front * 14.0);
    }
    return vec3(p, z);
  }

  // Un sitio del camino (de 0, al fondo de la garganta, a 1, fuera): su radio y su altura.
  vec2 along(float uu) {
    if (uu < ${THROAT.toFixed(2)}) {
      float t = uu / ${THROAT.toFixed(2)};
      return vec2(${HOLE.toFixed(3)} * mix(${NARROW.toFixed(2)}, 1.0, t * t), well(${HOLE.toFixed(3)}) - (1.0 - t) * ${THROAT_DEPTH.toFixed(2)});
    }
    float r = ${HOLE.toFixed(3)} * pow(${(OUTER / HOLE).toFixed(3)}, (uu - ${THROAT.toFixed(2)}) / ${(1 - THROAT).toFixed(2)});
    return vec2(r, well(r));
  }
`;

// Los números, para la ficha del modo wire (main.js).
export const INFO = { rings: RINGS, outer: OUTER, depth: DEPTH, throat: THROAT, hole: HOLE };

export function createWell({ ink }) {
  // Por cada punto: su anillo, su ángulo, un número al azar (para cuáles se ven) y su desvío.
  const us = [];
  const angles = [];
  const seeds = [];
  // El número de anillo de cada punto (para quitar uno de cada dos en pantallas pequeñas).
  const ringIndex = [];
  const jitters = [];

  // Los anillos, en partes iguales del camino; el radio de cada uno lo pone el shader.
  for (let k = 0; k < RINGS; k++) {
    const u = k / RINGS;
    // Cuántos puntos: todos los anillos, los mismos, los que caben en el más grande (el
    // de fuera). Cada anillo pasa por todos los tamaños al caer, así que no pueden ir con
    // los de su tamaño de partida: los de fuera llegarían al centro con demasiados y los de
    // dentro saldrían fuera con muy pocos. El shader enseña solo los que caben en el tamaño
    // que tiene en cada momento.
    const count = Math.round((Math.PI * 2 * OUTER) / SPACING);
    const start = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      us.push(u);
      angles.push(start + (i / count) * Math.PI * 2);
      // Su número dentro del anillo: cuando no caben todos, el shader enseña uno de cada
      // tantos, siempre a la misma distancia (sin huecos ni montones).
      seeds.push(i);
      ringIndex.push(k);
      jitters.push((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  // (La posición la calcula el shader; Three.js necesita igualmente un atributo «position».)
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(us.length * 3), 3));
  geometry.setAttribute('u', new THREE.Float32BufferAttribute(us, 1));
  geometry.setAttribute('angle', new THREE.Float32BufferAttribute(angles, 1));
  geometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute('ring', new THREE.Float32BufferAttribute(ringIndex, 1));
  geometry.setAttribute('jitter', new THREE.Float32BufferAttribute(jitters, 2));

  const uniforms = {
    ink: { value: new THREE.Color(ink) },
    phase: { value: 0 },
    pixelRatio: { value: 1 },
    distance: { value: 10 },
    // El reloj (segundos), para el disco.
    time: { value: 0 },
    // La densidad según el tamaño de la pantalla (1 = grande; menos, en pantallas pequeñas).
    density: { value: 1 },
    // Cada onda: x, y, su edad (segundos; muy grande: apagada) y su fuerza.
    ripples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 1e3, 0)) },
    // La masa del cursor: x, y y cuánto está (0: no está; 1: del todo).
    mass: { value: new THREE.Vector3() },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float u;
      attribute float angle;
      attribute float seed;
      attribute float ring;
      uniform float density;
      attribute vec2 jitter;
      uniform float phase;
      uniform float pixelRatio;
      uniform float distance;
      varying float vKeep;
      ${SURFACE}

      void main() {
        // El anillo cae con el tiempo y vuelve a empezar por fuera; en la garganta, la tela
        // se pliega hacia abajo, estrechándose, hasta perderse («along»).
        float uu = fract(u - phase);
        vec2 rz = along(uu);
        float r = rz.x;
        vec3 q = disturb(vec2(cos(angle), sin(angle)) * r + jitter * r * ${JITTER.toFixed(3)}, rz.y);

        vec4 view = modelViewMatrix * vec4(q, 1.0);
        gl_Position = projectionMatrix * view;
        // Más cerca, un pelo más grandes.
        gl_PointSize = ${SIZE.toFixed(1)} * mix(0.75, 1.0, density) * pixelRatio * distance / -view.z;
        // Cuántos puntos se quedan: hacia fuera, cada vez menos (el punteado se deshace);
        // al fondo de la garganta, también (se pierde); y al nacer por fuera, poco a poco.
        // (Y solo los que caben en el anillo a su tamaño de ahora: r / OUTER de todos.)
        // (En pantallas pequeñas, menos puntos por anillo, y uno de cada dos anillos.)
        // (step(mod(ring, 2), lleno): los anillos pares, siempre; los impares, solo si la
        // densidad es de 0,75 o más.)
        float keep = density * step(mod(ring, 2.0), step(0.75, density));
        keep *= (r / ${OUTER.toFixed(1)}) * (1.0 - smoothstep(0.45, 1.0, uu) * 0.92) * (1.0 - smoothstep(0.9, 1.0, uu)) * smoothstep(0.0, ${THROAT.toFixed(2)}, uu);
        // Uno de cada tantos, a intervalos exactos: el punto i se ve si con él se pasa a la
        // siguiente unidad al contar «keep» por punto (como se dibuja una línea en píxeles).
        vKeep = step(0.5, floor((seed + 1.0) * keep) - floor(seed * keep));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 ink;
      varying float vKeep;
      void main() {
        // Redondos: lo que cae fuera del círculo no se pinta.
        if (vKeep < 0.5 || length(gl_PointCoord - 0.5) > 0.5) discard;
        gl_FragColor = vec4(ink, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  const dots = new THREE.Points(geometry, material);
  dots.frustumCulled = false;

  // ---------------------------------------------------------------------------------------
  // La malla (grid), polar: círculos y radios sobre el mismo camino que los anillos de
  // puntos («along»: de 0, al fondo de la garganta, a 1, fuera), así que entran limpios por
  // la garganta. Los círculos caen con el tiempo, como los anillos; los radios se quedan.
  // ---------------------------------------------------------------------------------------
  const gridU = [];
  const gridAngle = [];
  const gridFlow = [];
  const gridLine = [];
  function vertex(u, a, flow, line) {
    gridU.push(u);
    gridAngle.push(a);
    gridFlow.push(flow);
    gridLine.push(line);
  }
  for (let k = 0; k < GRID_RINGS; k++) {
    for (let s = 0; s < GRID_STEPS; s++) {
      for (const t of [s, s + 1]) vertex(k / GRID_RINGS, (t / GRID_STEPS) * Math.PI * 2, 1, k);
    }
  }
  for (let k = 0; k < GRID_SPOKES; k++) {
    const a = (k / GRID_SPOKES) * Math.PI * 2;
    for (let s = 0; s < GRID_STEPS; s++) {
      for (const t of [s, s + 1]) vertex(t / GRID_STEPS, a, 0, k);
    }
  }
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(gridU.length * 3), 3));
  gridGeometry.setAttribute('u', new THREE.Float32BufferAttribute(gridU, 1));
  gridGeometry.setAttribute('angle', new THREE.Float32BufferAttribute(gridAngle, 1));
  gridGeometry.setAttribute('flow', new THREE.Float32BufferAttribute(gridFlow, 1));
  gridGeometry.setAttribute('line', new THREE.Float32BufferAttribute(gridLine, 1));
  const gridMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float u;
      attribute float angle;
      attribute float flow;
      attribute float line;
      uniform float phase;
      uniform float density;
      varying float vAlpha;
      ${SURFACE}

      void main() {
        // Los círculos caen (como los anillos de puntos); los radios, quietos.
        float uu = flow > 0.5 ? fract(u - phase) : u;
        vec2 rz = along(uu);
        vec3 q = disturb(vec2(cos(angle), sin(angle)) * rz.x, rz.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0);
        // Hacia fuera se apaga; al fondo de la garganta, también (se pierde); y en pantallas
        // pequeñas, una de cada dos líneas.
        vAlpha = (1.0 - smoothstep(0.5, 1.0, uu)) * smoothstep(0.0, ${THROAT.toFixed(2)}, uu) * step(mod(line, 2.0), step(0.75, density));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 ink;
      varying float vAlpha;
      void main() {
        gl_FragColor = vec4(ink, vAlpha * 0.85);
        #include <colorspace_fragment>
      }
    `,
  });
  const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
  grid.frustumCulled = false;

  // ---------------------------------------------------------------------------------------
  // El disco (orbit): cada partícula está en un sitio del camino (u) que baja con el tiempo,
  // como los anillos, y su ángulo sale de ahí: si cae a ritmo constante por el camino, y en
  // una órbita se gira como 1 / r^1,5, el ángulo crece como e^(−1,5·L·u) (L = el logaritmo
  // de lo largo del camino). Así se puede calcular en el shader sin guardar nada de un
  // fotograma a otro. La estela: unos cuantos puntos más, cada uno un poco más atrás.
  // ---------------------------------------------------------------------------------------
  const orbitU = [];
  const orbitAngle = [];
  const orbitSpeed = [];
  const orbitTrail = [];
  for (let k = 0; k < PARTICLES; k++) {
    const u = Math.random();
    const a = Math.random() * Math.PI * 2;
    const speed = 0.7 + Math.random() * 0.6;
    for (let i = 0; i < TRAIL; i++) {
      orbitU.push(u);
      orbitAngle.push(a);
      orbitSpeed.push(speed);
      orbitTrail.push(i);
    }
  }
  const orbitGeometry = new THREE.BufferGeometry();
  orbitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(orbitU.length * 3), 3));
  orbitGeometry.setAttribute('u', new THREE.Float32BufferAttribute(orbitU, 1));
  orbitGeometry.setAttribute('angle', new THREE.Float32BufferAttribute(orbitAngle, 1));
  orbitGeometry.setAttribute('speed', new THREE.Float32BufferAttribute(orbitSpeed, 1));
  orbitGeometry.setAttribute('trail', new THREE.Float32BufferAttribute(orbitTrail, 1));
  const orbitMaterial = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float u;
      attribute float angle;
      attribute float speed;
      attribute float trail;
      uniform float time;
      uniform float pixelRatio;
      uniform float distance;
      uniform float density;
      varying float vGlow;
      ${SURFACE}

      void main() {
        // Dónde va por el camino (la estela, un poco más atrás) y su ángulo.
        float uu = fract(u - time * ${ORBIT_FALL.toFixed(3)} * speed + trail * ${TRAIL_GAP.toFixed(4)});
        float L = ${Math.log(OUTER / HOLE).toFixed(4)};
        float a = angle + ${SWIRL.toFixed(1)} * speed * exp(-1.5 * L * uu);
        vec2 rz = along(uu);
        vec3 q = disturb(vec2(cos(a), sin(a)) * rz.x, rz.y);
        vec4 view = modelViewMatrix * vec4(q, 1.0);
        gl_Position = projectionMatrix * view;
        float head = 1.0 - trail / ${TRAIL.toFixed(1)};
        gl_PointSize = ${PARTICLE_SIZE.toFixed(1)} * mix(0.75, 1.0, density) * (0.4 + 0.6 * head) * pixelRatio * distance / -view.z;
        // Más brillantes cerca del agujero; se apagan al nacer por fuera y al perderse por la
        // garganta; la estela, cada vez más tenue.
        vGlow = head * head * (0.35 + 0.65 * (1.0 - uu)) * smoothstep(0.0, ${THROAT.toFixed(2)}, uu) * (1.0 - smoothstep(0.85, 1.0, uu));
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 ink;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(ink * vGlow * (1.0 - d * 1.6), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const orbit = new THREE.Points(orbitGeometry, orbitMaterial);
  orbit.frustumCulled = false;

  // «spin» gira en su plano, con las tres capas (se ve una u otra según el modo); «object»,
  // que lo contiene, va donde el agujero y se inclina.
  const spin = new THREE.Group();
  spin.add(dots, grid, orbit);
  const object = new THREE.Group();
  object.add(spin);
  object.visible = false;

  let phase = 0;
  let nextRipple = 0;
  // La masa: dónde quiere estar y cuánto está ahora (de 0 a 1).
  let massAt = null;
  let massLevel = 0;

  // Dónde cae un punto de la pantalla (x, y de -1 a 1) sobre el plano de la tela, en sus
  // coordenadas (las de «spin»). Null si no cae (mirando de canto).
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane();
  const normal = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const hit = new THREE.Vector3();
  function toPlane(x, y, camera) {
    spin.updateWorldMatrix(true, false);
    normal.set(0, 0, 1).transformDirection(spin.matrixWorld);
    origin.setFromMatrixPosition(spin.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(normal, origin);
    raycaster.setFromCamera({ x, y }, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    spin.worldToLocal(hit);
    return { x: hit.x, y: hit.y };
  }

  // Una onda desde (x, y) de la pantalla, con su fuerza (1, la de un toque; la estela, menos).
  // Reemplaza a la más vieja.
  function ripple(x, y, camera, strength = 1) {
    const at = toPlane(x, y, camera);
    if (!at) return;
    uniforms.ripples.value[nextRipple].set(at.x, at.y, 0, strength);
    nextRipple = (nextRipple + 1) % MAX_RIPPLES;
  }

  // Dónde está el cursor (x, y de la pantalla), o null si no está: la masa lo sigue.
  function setCursor(x, y, camera) {
    massAt = x === null ? null : toPlane(x, y, camera);
  }

  // Cada fotograma (main.js): el avance, el giro, la densidad de píxeles y lo lejos que está
  // la cámara (para el tamaño de los puntos).
  // «shortSide»: el lado corto de la pantalla, en píxeles (para la densidad).
  function update(dt, angle, pixelRatio, distance, shortSide = DENSE_FROM) {
    uniforms.density.value = Math.min(1, Math.max(MIN_DENSITY, shortSide / DENSE_FROM));
    phase = (phase + FALL * dt) % 1;
    uniforms.time.value += dt;
    uniforms.phase.value = phase;
    uniforms.pixelRatio.value = pixelRatio;
    uniforms.distance.value = distance;
    // Gira, pero mucho menos que los rayos: aquí lo que se tiene que ver es la caída.
    spin.rotation.z = angle * SPIN_SHARE;
    for (const w of uniforms.ripples.value) w.z += dt;
    massLevel += ((massAt ? 1 : 0) - massLevel) * Math.min(1, dt / MASS_EASE);
    if (massAt) uniforms.mass.value.set(massAt.x, massAt.y, massLevel);
    else uniforms.mass.value.z = massLevel;
  }

  function dispose() {
    for (const layer of [dots, grid, orbit]) {
      layer.geometry.dispose();
      layer.material.dispose();
    }
  }

  // Cómo se ve: «dots» (los puntos), «grid» (la malla) u «orbit» (el disco), y de qué
  // color.
  function setLook(look, color) {
    dots.visible = look === 'dots';
    grid.visible = look === 'grid';
    orbit.visible = look === 'orbit';
    uniforms.ink.value.set(color);
  }

  return { object, update, ripple, setCursor, setLook, dispose };
}
