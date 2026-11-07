# gravity

Un pozo de gravedad dibujado con puntos, que se altera a tu paso. Un experimento de [VERTIK](https://www.vertik.net).

Demo: [scorcoles.github.io/gravity](https://scorcoles.github.io/gravity/) · En la web: [vertik.net/gravity](https://www.vertik.net/gravity/)

- Una tela de puntos negros sobre rosa, vista en ángulo, con un solo agujero: los anillos se encogen y caen sin parar hacia él, y al llegar, la tela se pliega sobre sí misma en una garganta por la que se pierden.
- El agujero sigue al cursor, con pereza (con el dedo, casi sin resistencia), y se queda donde lo dejes; al moverse, la tela se inclina hacia donde va.
- El cursor es una masa: hunde la tela donde está, atrae los puntos y deja una estela de ondas.
- Cada toque o clic lanza una onda grande, que suena a impacto. Manteniendo pulsado, todo se acerca.
- Sonido (el altavoz de arriba): un fondo muy grave, una caída sin fin (cinco notas a una octava que bajan juntas sin llegar nunca abajo: la ilusión de Shepard) y el impacto. Y de vez en cuando, al azar, estática de radio de fondo.
- Dos modos (← Prev · Next → en el pie, las flechas o `#wire`): el rosa, y **wire**, en gris y negro, con los números.
- En pantallas pequeñas, menos densidad (menos puntos por anillo y uno de cada dos anillos), para que no se amontonen.

## Cómo está hecho

[Three.js](https://threejs.org) y [Vite](https://vite.dev).

| Archivo | Qué hace |
| --- | --- |
| `index.html` · `style.css` | La página: los puntos a toda pantalla, el símbolo, los botones y el pie. |
| `src/main.js` | El escenario, el agujero, la inclinación, el zoom y los modos. |
| `src/well.js` | El pozo: los puntos, su shader, las ondas y la masa del cursor. |
| `src/sound.js` · `src/share.js` | El sonido y compartir. |

```sh
npm install
npm run dev     # para trabajar
npm run build   # dist/gravity.js y dist/gravity.css, para la web de VERTIK
```
