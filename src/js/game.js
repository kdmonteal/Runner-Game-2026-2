/* Logica de todo el juego */

/* SISTEMA DE COORDENADAS:
    - Bloque 1x1x1
    - Eje X -> Derecha (avance del jugador)
    - Eje Y -> Arriba (altura del jugador)
    - Eje Z -> Adelante (profundidad del jugador)
*/
import * as THREE from 'three';

const CONFIG = {
    GRAVEDAD: -32,
    VEL_CAMINAR: 6,
    VEL_CORRER: 9,
    ACELERACION: 40,
    FRICCION: 30,
    FUERZA_SALTO: 15,
    CORTE_SALTO: 0.45,
    VEL_MAX_CAIDA: -20,
    TIEMPO_COYOTE: 0.1,
    BUFFER_SALTO: 0.12,
    VIDAS_INICIALES: 3,
    TIEMPO_NIVEL: 300,
    LIMITE_CAIDA: -5,
    VEL_ENEMIGO: 1.5,
    INVULNERABLE: 2.0,
};

/* Diseño del nivel (TILEMAP) */
/* **************************************************
    # Suelo
    G bloque sorpresa
    C Columna de piedra
    E Enemigo
    K Punto de control
    B ladrillo (se puede romper)
    S bloque de piedra (escaleras)
    o Coleccionable (gema)
    P Jugador (posición inicial)
    F Bandera de Meta
***************************************************** */
const MAPA_NIVEL = [
  "",
  "                                                                   ooo                               SS",
  "          G                                                        BBB                              SSS",
  "                              oooo                                                                 SSSS",
  "                              BBBB                    SS   S                                      SSSSS",
  "        GBGBG                                        SSS   SS     BGBGB          oo   GGG        SSSSSS",
  "                    C                     C         SSSS   SSS                                  SSSSSSS",
  "  P            E    C               E E   C    E   SSSSS   SSSS K       E E               E    SSSSSSSS   F",
  "#########################  #############################   ######################  ###########################",
];

// Caracteres sólidos (el jugador choca con ellos).
// K y F NO van aquí: el jugador debe atravesarlos para activarlos.
// U = bloque sorpresa ya usado (aparece cuando se golpea una G).
const SOLIDOS = new Set(["#", "B", "G", "S", "C", "U"]);

const COLOR_CIELO = 0x6ec6ff;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLOR_CIELO);
// FOG
scene.fog = new THREE.Fog(COLOR_CIELO, 25, 60);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(5, 5, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setAnimationLoop(animate);
document.body.appendChild(renderer.domElement);

const light = new THREE.AmbientLight( 0x404040, 50); // soft white light
scene.add( light );


window.addEventListener('resize', () => {
    // 1. Actualizar el tamaño del renderizador
    renderer.setSize(window.innerWidth, window.innerHeight);

    // 2. Actualizar la relación de aspecto de la cámara
    camera.aspect = window.innerWidth / window.innerHeight;

    // 3. Renderizar los cambios en la matriz de proyección
    camera.updateProjectionMatrix();
});


/* Diseño del nivel (TILEMAP) */
/* ************************************************** */
let grupoNivel = null,
    bloques = new Map(),
    gemas = [],
    enemigos = [],
    particulas = [],
    posicionInicial = { x: 2.5, y: 1 },
    puntoControl = null,
    banderaMeta = null;
/* ************************************************** */

const clave = (x, y) => x + "," + y;

function construirNivel() {
    // Eliminar el grupo de nivel anterior
    if (grupoNivel) scene.remove(grupoNivel);

    grupoNivel = new THREE.Group();
    scene.add(grupoNivel);

    bloques = new Map();
    gemas = [];
    enemigos = [];
    particulas = [];

    const alto = MAPA_NIVEL.length;
    MAPA_NIVEL.forEach((fila, y) => {
        const yMundo = alto - 1 - y; // Invertir el eje Y para que (0,0) esté en la esquina inferior izquierda

        for (let index = 0; index < fila.length; index++) {
            const element = fila[index];

            if (SOLIDOS.has(element)) {
                // Crear un bloque sólido
                crearBloque(index, yMundo, element);
            }
        }

    })
}

// 1. Crear el cargador de texturas
const textureLoader = new THREE.TextureLoader();
// 2. Cargar la imagen especificando su ruta (local o URL externa)
const texTierra = textureLoader.load('./src/img/texture/ground.jpg');
const texSuelo = textureLoader.load('./src/img/texture/pasto.jpg');
const texLadrillo = textureLoader.load('./src/img/texture/ladrillo.jpg');
// Tierra de relleno: la caja mide 1x4, así que repetimos la imagen 4 veces en vertical
const texTierraRelleno = textureLoader.load('./src/img/texture/ground.jpg');
texTierraRelleno.wrapS = THREE.RepeatWrapping;
texTierraRelleno.wrapT = THREE.RepeatWrapping;
texTierraRelleno.repeat.set(1, 4);
const texSueloLado = textureLoader.load('./src/img/texture/suelo-lado.jpg');  // lados del suelo (ground + borde de pasto)
const texSorpresa  = textureLoader.load('./src/img/texture/sorpresa.jpg');
const texUsado     = textureLoader.load('./src/img/texture/usado.jpg');
const texPiedra    = textureLoader.load('./src/img/texture/piedra.jpg');
const texColumna   = textureLoader.load('./src/img/texture/columna.jpg');

// Indicar que las imágenes están en sRGB (si no, los colores se ven lavados)
[texTierra, texSuelo, texLadrillo, texTierraRelleno, texSueloLado,
 texSorpresa, texUsado, texPiedra, texColumna].forEach(tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
});


// CREAR LOS MATERIALES
// MeshLambertMaterial: material sencillo que reacciona a la luz.
const matSueloLado = new THREE.MeshLambertMaterial({ map: texSueloLado });
const MATERIALES = {
    // Un BoxGeometry tiene 6 caras, en este orden: [+X, -X, +Y (arriba), -Y (abajo), +Z, -Z]
    // Pasando un ARREGLO de materiales, cada cara usa uno distinto.
    suelo: [
        matSueloLado,
        matSueloLado,
        new THREE.MeshLambertMaterial({ map: texSuelo }),   // arriba: pasto
        new THREE.MeshLambertMaterial({ map: texTierra }),  // abajo: tierra
        matSueloLado,
        matSueloLado,
    ],
    tierra:   new THREE.MeshLambertMaterial({ map: texTierraRelleno }),
    ladrillo: new THREE.MeshLambertMaterial({ map: texLadrillo }),
    // emissive: el bloque "brilla" un poco aunque esté en sombra
    sorpresa: new THREE.MeshLambertMaterial({ map: texSorpresa, emissive: 0x332200 }),
    usado:    new THREE.MeshLambertMaterial({ map: texUsado }),
    piedra:   new THREE.MeshLambertMaterial({ map: texPiedra }),
    columna:  new THREE.MeshLambertMaterial({ map: texColumna }),
    // La gema no usa imagen: un color brillante se ve mejor en un objeto pequeño
    gema:     new THREE.MeshPhongMaterial({ color: 0x26c6da, emissive: 0x0b5560, shininess: 100 }),
};

// Reutilizamos UNA sola geometría para todos los bloques (ahorra memoria)
const GEO_BLOQUE = new THREE.BoxGeometry(1, 1, 1);
const GEO_TIERRA = new THREE.BoxGeometry(1, 4, 1);
const GEO_GEMA = new THREE.OctahedronGeometry(0.28);

// sorpresa: ,
//     piedra: ,
//     columna: , 
//     gema: 
function crearBloque(x, y, tipo) {
    // Seleccionar el material que se le va a colocar al bloque según su tipo
    const material = {
        "#": MATERIALES.suelo,
        "B": MATERIALES.ladrillo,
        "G": MATERIALES.sorpresa,
        "S": MATERIALES.piedra,
        "C": MATERIALES.columna,
        "U": MATERIALES.usado,
    }[tipo];

    const malla = new THREE.Mesh(GEO_BLOQUE, material);
    // +0.5 porque el cubo se ubica desde su centro, pero la casilla va de x a x+1
    malla.position.set(x + 0.5, y + 0.5, 0);
    malla.castShadow = true;
    malla.receiveShadow = true;
    grupoNivel.add(malla);
    bloques.set(clave(x, y), { x, y, tipo, malla, rebote: 0 });

    // Debajo de cada bloque de suelo agregamos tierra (solo decorativa, sin colisión)
    if (tipo === "#") {
        const tierra = new THREE.Mesh(GEO_TIERRA, MATERIALES.tierra);
        tierra.position.set(x + 0.5, y - 2, 0);
        tierra.receiveShadow = true;
        grupoNivel.add(tierra);
    }
}

/*   INTERFAZ: HUD Y PANTALLAS 
 */

const ui = {
    vidas: document.getElementById("hud-vidas"),
    gemas: document.getElementById("hud-gemas"), 
    puntos: document.getElementById("hud-puntos"),
    tiempo: document.getElementById("hud-tiempo"),
    inicio: document.getElementById("pantalla-inicio"),
    pausa: document.getElementById("pantalla-pausa"),
    fin: document.getElementById("pantalla-fin"),
    finTitulo: document.getElementById("fin-titulo"),
    finDetalle: document.getElementById("fin-detalle")
}

// Funcion actualizar HUD

// Temporizador

document.getElementById("btn-jugar").addEventListener('click', iniciarJuego);
document.getElementById("btn-reiniciar").addEventListener('click', iniciarJuego);


function alternarPausa() {
    if(estado === 'jugando'){
        estado = 'pausa';
        ui.pausa.classList.remove('oculto');
    }else{
        estado = 'jugando';
        ui.pausa.classList.add('oculto');
        // modificar el tiempo reloj para que se detenga.
    }
}

// ********************************************
// Personaje
// ********************************************
//Crear malla y ubicarlas
function pieza(geometria, material, x, y, z) {
    const malla = new THREE.Mesh(geometria,material);
    malla.position.set(x,y,z);
    malla.castShadow = true;
    return malla;
}

function crearModeloJugador() {
    const grupo = new THREE.Group();
    const matCuerpo = new THREE.MeshLambertMaterial({color: 0x2ec4b6});
    const matOscuro = new THREE.MeshLambertMaterial({color: 0x1b2a41});
    const matLuz = new THREE.MeshLambertMaterial({color: 0xffd23f, emissive:0x664400});
    const matOjo = new THREE.MeshBasicMaterial({color: 0x7df9ff});

    // Piernas
    const piernaIzq = pieza(new THREE.BoxGeometry(0.16,0.2,0.22), matOscuro, -0.14, 0.1, 0);
    const piernaDer = pieza(new THREE.BoxGeometry(0.16,0.2,0.22), matOscuro, 0.14, 0.1, 0);
    // Cuerpo
    const cuerpo = pieza(new THREE.BoxGeometry(0.6,0.4,0.48), matCuerpo, 0,0.4,0);
    // Cabeza
    const cabeza = pieza(new THREE.BoxGeometry(0.56,0.34,0.5), matCuerpo, 0,0.77,0);
    const visor = pieza(new THREE.BoxGeometry(0.46,0.2,0.04), matOscuro, 0,0.78,0.26);
    const ojoIzq = pieza(new THREE.BoxGeometry(0.08,0.1,0.02), matOjo, -0.1, 0.79, 0.285);
    const ojoDerecho = pieza(new THREE.BoxGeometry(0.08,0.1,0.02), matOjo, 0.1, 0.79, 0.285);
    // Antena
    const antena = pieza(new THREE.CylinderGeometry(0.025,0.025,0.2), matOscuro, 0, 1.03, 0);
    const foco = pieza(new THREE.SphereGeometry(0.07,12,12), matLuz, 0, 1.15,0);
    // Mochila
    const mochila = pieza(new THREE. BoxGeometry(0.4,0.32,0.14), matLuz,0,0.42,-0.3);

    grupo.add(piernaIzq,piernaDer,cuerpo, cabeza,visor,ojoIzq, ojoDerecho, antena, foco, mochila);
    grupo.userData = {piernaIzq, piernaDer};
    return grupo;

}

// ********************************************
// Jugador
// ********************************************
const jugador ={
    x:0,
    y:0,
    vx:0, 
    vy:0,
    ancho: 0.7,
    alto:0.9,
    enSuelo: false,
    mirando: 1, // 1=Derecha, -1 = Izquierda
    tiempoCoyote: 0,
    bufferSalto: 0,
    saltando: false,
    invulnerable: 0,
    tiempoAnimacion: 0,
    malla: crearModeloJugador()
}

scene.add(jugador.malla);


function actualizarJugador(dt) {
  const j = jugador;

  // --- Movimiento horizontal con aceleración y fricción ---
  let direccion = 0;
  if (teclaIzquierda()) direccion -= 1;
  if (teclaDerecha()) direccion += 1;
  const velocidadMaxima = teclaCorrer() ? CONFIG.VEL_CORRER : CONFIG.VEL_CAMINAR;

  if (direccion !== 0) {
    j.vx += direccion * CONFIG.ACELERACION * dt;
    j.vx = Math.max(-velocidadMaxima, Math.min(velocidadMaxima, j.vx)); // limitar (clamp)
    j.mirando = direccion;
  } else {
    // Fricción: reducimos la velocidad poco a poco hasta llegar a 0
    const freno = CONFIG.FRICCION * dt;
    j.vx = Math.abs(j.vx) <= freno ? 0 : j.vx - Math.sign(j.vx) * freno;
  }

  // --- Salto ---
  // "Coyote time": unos milisegundos de gracia para saltar después de dejar el borde
  j.tiempoCoyote = j.enSuelo ? CONFIG.TIEMPO_COYOTE : j.tiempoCoyote - dt;
  j.bufferSalto -= dt;

  if (j.bufferSalto > 0 && j.tiempoCoyote > 0) {
    j.vy = CONFIG.FUERZA_SALTO;
    j.bufferSalto = 0;
    j.tiempoCoyote = 0;
    j.saltando = true;
    sonido('salto');
  }

  // Salto variable: si sueltas el botón mientras subes, el salto se corta
  if (j.saltando && !teclaSaltoPresionada() && j.vy > 0) {
    j.vy *= CONFIG.CORTE_SALTO;
    j.saltando = false;
  }
  if (j.vy <= 0) j.saltando = false;

  // --- Gravedad ---
  j.vy += CONFIG.GRAVEDAD * dt;
  j.vy = Math.max(j.vy, CONFIG.VEL_MAX_CAIDA);

  // --- Mover y resolver colisiones ---
  moverEntidad(j, dt, golpearBloque);

  // No dejar que salga por el borde izquierdo del mundo
  if (j.x < j.ancho / 2) { j.x = j.ancho / 2; j.vx = 0; }

  // --- ¿Se cayó al vacío? ---
  if (j.y < CONFIG.LIMITE_CAIDA) {
    perderVida(false);
    return;
  }

  // --- Recoger gemas ---
  gemas.forEach(g => {
    if (!g.recogida && seSuperponen(j, { x: g.x + 0.5, y: g.y + 0.15, ancho: 0.6, alto: 0.7 })) {
      g.recogida = true;
      grupoNivel.remove(g.malla);
      sumarGema(100);
    }
  });

  // --- Punto de control ---
  if (puntoControl && !puntoControl.activo && j.x >= puntoControl.x) {
    puntoControl.activo = true;
    puntoControl.bandera.userData.tela.material.color.set(0x4caf50); // se pone verde
    mostrarAviso('¡PUNTO DE CONTROL!');
    sonido('vida');
  }

  // --- Meta ---
  if (meta && j.x >= meta.x - 0.2) {
    ganarNivel();
  }

  if (j.invulnerable > 0) j.invulnerable -= dt;
  actualizarModeloJugador(dt);
}

// ---------- Enemigo: un "blob" morado con ojos ----------
function crearModeloEnemigo() {
  const grupo = new THREE.Group();
  const matCuerpo = new THREE.MeshLambertMaterial({ color: 0x9b5de5 });
  const matBlanco = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const matNegro = new THREE.MeshBasicMaterial({ color: 0x111111 });

  const cuerpo = pieza(new THREE.SphereGeometry(0.42, 20, 16), matCuerpo, 0, 0.32, 0);
  cuerpo.scale.set(1, 0.78, 0.9);     // achatamos la esfera
  const ojoIzq = pieza(new THREE.SphereGeometry(0.1, 10, 10), matBlanco, -0.14, 0.42, 0.3);
  const ojoDer = pieza(new THREE.SphereGeometry(0.1, 10, 10), matBlanco, 0.14, 0.42, 0.3);
  const pupIzq = pieza(new THREE.SphereGeometry(0.05, 8, 8), matNegro, -0.14, 0.42, 0.39);
  const pupDer = pieza(new THREE.SphereGeometry(0.05, 8, 8), matNegro, 0.14, 0.42, 0.39);
  // Cejas enojadas
  const cejaIzq = pieza(new THREE.BoxGeometry(0.16, 0.04, 0.04), matNegro, -0.14, 0.55, 0.33);
  cejaIzq.rotation.z = -0.4;
  const cejaDer = pieza(new THREE.BoxGeometry(0.16, 0.04, 0.04), matNegro, 0.14, 0.55, 0.33);
  cejaDer.rotation.z = 0.4;

  grupo.add(cuerpo, ojoIzq, ojoDer, pupIzq, pupDer, cejaIzq, cejaDer);
  return grupo;
}

// ---------- Bandera (meta) y punto de control ----------
function crearBandera(alto, colorTela) {
  const grupo = new THREE.Group();
  const matPoste = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
  const matTela = new THREE.MeshLambertMaterial({ color: colorTela, side: THREE.DoubleSide });
  grupo.add(pieza(new THREE.CylinderGeometry(0.06, 0.06, alto), matPoste, 0, alto / 2, 0));
  grupo.add(pieza(new THREE.SphereGeometry(0.14, 12, 12), MATERIALES.sorpresa, 0, alto + 0.1, 0));
  const tela = pieza(new THREE.BoxGeometry(0.9, 0.6, 0.04), matTela, -0.48, alto - 0.4, 0);
  grupo.add(tela);
  grupo.userData.tela = tela;
  return grupo;
}

// ********************************************
// ENTRADA DE TECLADO
// ********************************************
const teclas = {};
window.addEventListener('keydown', (e) => {
    teclas[e.code] = true;

    // Evita que la pagina haga scroll con el espacio o las flechas
    if(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();


    // validar el salto

    if(e.code === 'KeyP') alternarPausa();
    if(e.code === 'KeyR' && estado!=='inicio') iniciarJuego();
    if(e.code === 'Enter' && (estado==='inicio') || (estado==='gameover') || (estado==='victoria')) iniciarJuego();

});

window.addEventListener('keyup', (e) => {teclas[e.code] = false;});


const esTeclaSalto = (code) => code === 'Space' || code === 'ArrowUp' || code === 'KeyW';
const teclaIzquierda = () => teclas['ArrowLeft'] || teclas['KeyA'];
const teclaDerecha = () => teclas['ArrowRight'] || teclas['KeyD'];
const teclaSaltoPresionada = () => teclas['Space'] || teclas['ArrowUp'] || teclas['KeyW'];
const teclaCorrer = () => teclas['ShiftLeft'] || teclas['ShiftRight'];



// ********************************************
// Variables de juego
// ESTADO DE JUEGO Y EL BUCLE
// ********************************************
let estado = 'inicio',
    vidas,
    puntos,
    gemasRecogidas,
    tiempoRestante,
    tiempoMuerte;

function iniciarJuego() {
    // Creación de audio

    vidas = CONFIG.VIDAS_INICIALES;
    puntos = 0;
    gemasRecogidas = 0;
    tiempoRestante = CONFIG.TIEMPO_NIVEL;
    puntoControl = null;
    banderaMeta = null;

    // Construir el nivel UNA sola vez (no dentro de animate, que corre 60 veces por segundo)
    construirNivel();

    ui.inicio.classList.add('oculto');
    ui.fin.classList.add('oculto');
    ui.pausa.classList.add('oculto');
}



function animate(time) {
    renderer.render(scene, camera);

}