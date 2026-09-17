# ⚽ Penales

Un juego de tanda de penales para jugar **contra la máquina** o **de a dos en la misma pantalla**.
Pateás *y* atajás: cada penal se define eligiendo un rincón del arco y midiendo la potencia.

---

## Cómo jugar

1. Abrí el juego (ver abajo).
2. Elegí **1 jugador** (contra la máquina) o **2 jugadores**.
3. Ponele nombre y color a cada equipo. En 1 jugador, elegí también la dificultad.
4. ¡A patear!

### Los controles

| Qué querés hacer | Teclado | Mouse o dedo |
|---|---|---|
| Moverte entre los 6 rincones del arco | Flechas ← ↑ → ↓ | — |
| Elegir el rincón | Espacio o Enter | Tocá el rincón |
| Frenar la barra de potencia | Espacio o Enter | Tocá la pantalla |
| Pasar al siguiente penal | Espacio o Enter | Botón *Seguir* |

### Las reglas

- **Cinco penales por equipo**, alternados. Si uno ya no puede alcanzar al otro, la tanda se corta ahí.
- Si terminan empatados, se va a **muerte súbita**: de a un penal cada uno hasta que alguno falle.
- **La barra de potencia es el riesgo**: cuanta más fuerza, más difícil de atajar… pero si la frenás
  en la franja roja, la pelota se va afuera o al palo.
- El arquero puede sacarla aunque se tire al palo de al lado: un manotazo siempre puede aparecer.

### De a dos, sin espiar

Cuando juegan dos personas, **primero elige el arquero y después el pateador**, con una pantalla de
traspaso en el medio que tapa todo. Así nadie ve la elección del otro y la tanda es pareja.

---

## Cómo abrirlo

**La forma más simple:** descargá los archivos y hacé doble clic en `index.html`.
Se abre en tu navegador y listo. No hay nada que instalar.

**Si querés un link para compartir:** GitHub puede publicarlo solo, con *GitHub Pages*
(Settings → Pages → Branch: la rama que quieras → Save). Tené en cuenta que
**GitHub Pages necesita que el repositorio sea público**. Si preferís que siga privado,
usá la opción de arriba: el juego anda igual.

---

## Sobre tus datos

Este juego está hecho a propósito para no poder filtrar nada:

- **No hace ni un solo pedido a internet.** Anda perfecto con el wifi apagado.
  Lo único que el navegador descarga son los tres archivos del juego.
- **No tiene dependencias de terceros**: ni librerías, ni frameworks, ni fuentes de Google,
  ni CDNs, ni publicidad, ni analíticas. Todo el código está acá y lo podés leer.
- **No te pide ni guarda datos personales.** Ni mail, ni nombre, ni cuenta.
- **Los récords quedan en tu navegador**, en `localStorage`, bajo la clave `ftbol_penales_v1`.
  Nunca salen de tu máquina. Se borran solos si limpiás los datos del navegador.
- El único texto que escribís son los **nombres de los equipos** (16 caracteres como máximo),
  y se muestran siempre como texto plano, nunca como código.
- La página declara una **Content-Security-Policy** estricta: el navegador tiene prohibido
  cargar o ejecutar cualquier cosa que no sean estos tres archivos.

---

## Qué hay adentro

```
index.html   La página: marcador, menús y el canvas donde se juega
styles.css   Los estilos de los menús y el marcador
game.js      El juego entero: física, dibujo, la máquina, sonido y récords
```

Sin `package.json`, sin compilación, sin paso de build. Se abre y se juega.

Los dibujos están hechos con canvas 2D (no hay ni una imagen) y los sonidos se generan
con la Web Audio API (no hay ni un archivo de audio).
