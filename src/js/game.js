/* =====================================================================
   RUNNER GAME — Lógica de todo el juego (texturas desde imágenes)

   ÍNDICE
     1.  Configuración
     2.  Diseño del nivel (TILEMAP)
     3.  Escena, cámara, renderizador y luces
     4.  Texturas desde imágenes (TextureLoader + LoadingManager)
     5.  Modelos 3D: jugador, enemigo, bandera
     6.  Construcción del nivel
     7.  Entrada del teclado
     8.  Física y colisiones
     9.  Bloques: romper y bloques sorpresa
     10. Jugador
     11. Enemigos
     12. Partículas y animaciones del nivel
     13. Cámara que sigue al jugador
     14. Interfaz (HUD y pantallas)
     15. Estados del juego y bucle principal (animate)

   SISTEMA DE COORDENADAS:
     - Bloque 1x1x1
     - Eje X -> Derecha (avance del jugador)
     - Eje Y -> Arriba (altura del jugador)
     - Eje Z -> Adelante (profundidad, solo visual: el juego se mueve en X e Y)

   ESTRUCTURA DE CARPETAS
     index.html
     src/css/style.css
     src/js/game.js      ← este archivo
     src/img/texture/    ground.jpg, pasto.jpg, ladrillo.jpg (fotos),
                         suelo-lado.jpg, piedra.jpg, columna.jpg,
                         sorpresa.jpg, usado.jpg
   ===================================================================== */
import * as THREE from 'three';


/* =====================================================================
   1. CONFIGURACIÓN
   Cambiar estos números cambia cómo "se siente" el juego.
   ===================================================================== */
const CONFIG = {
    GRAVEDAD: -32,          // aceleración hacia abajo (unidades/segundo²)
    VEL_CAMINAR: 6,         // velocidad máxima caminando
    VEL_CORRER: 9,          // velocidad máxima con SHIFT
    ACELERACION: 40,        // qué tan rápido alcanza la velocidad máxima
    FRICCION: 30,           // qué tan rápido frena al soltar las teclas
    FUERZA_SALTO: 15,       // velocidad vertical inicial del salto
    CORTE_SALTO: 0.45,      // si sueltas el botón antes, el salto se corta
    VEL_MAX_CAIDA: -20,     // límite de velocidad al caer
    TIEMPO_COYOTE: 0.1,     // gracia para saltar justo después de salir del borde
    BUFFER_SALTO: 0.12,     // si presionas saltar un poco antes de tocar el suelo, igual salta
    VIDAS_INICIALES: 3,
    TIEMPO_NIVEL: 300,      // segundos para completar el nivel
    LIMITE_CAIDA: -5,       // si el jugador baja de esta Y, se cayó al vacío
    VEL_ENEMIGO: 1.5,
    INVULNERABLE: 2.0,      // segundos de invulnerabilidad tras perder una vida
};


/* =====================================================================
   2. DISEÑO DEL NIVEL (TILEMAP)
   Cada carácter es una casilla de 1x1. La PRIMERA fila es la de ARRIBA.
   **************************************************
    # Suelo                    B ladrillo (se puede romper)
    G bloque sorpresa          S bloque de piedra (escaleras)
    C Columna de piedra        o Coleccionable (gema)
    E Enemigo                  P Jugador (posición inicial)
    K Punto de control         F Bandera de Meta
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

// Caracteres SÓLIDOS: el jugador choca con ellos.
// OJO: K (punto de control) y F (meta) NO van aquí. No son bloques: son objetos
// que el jugador debe ATRAVESAR para activarlos. Si fueran sólidos, la meta
// sería una pared y nunca se podría ganar.
// U = bloque sorpresa ya usado (no está en el mapa: aparece cuando golpeas una G).
const SOLIDOS = new Set(["#", "B", "G", "S", "C", "U"]);


/* =====================================================================
   3. ESCENA, CÁMARA, RENDERIZADOR Y LUCES
   ===================================================================== */
const COLOR_CIELO = 0x6ec6ff;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLOR_CIELO);
// FOG: lo lejano se mezcla con el cielo (da profundidad)
scene.fog = new THREE.Fog(COLOR_CIELO, 25, 60);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(5, 5, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // máx. 2: nítido sin exigir demasiado a la GPU
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
    // 1. Actualizar el tamaño del renderizador
    renderer.setSize(window.innerWidth, window.innerHeight);
    // 2. Actualizar la relación de aspecto de la cámara
    camera.aspect = window.innerWidth / window.innerHeight;
    // 3. Recalcular la matriz de proyección con el nuevo aspecto
    camera.updateProjectionMatrix();
});

// LUCES
// Una AmbientLight sola ilumina todo por igual: no hay sombras ni volumen
// (los cubos se ven planos). Por eso combinamos dos luces:
//  - HemisphereLight: luz de relleno, color del cielo arriba y del pasto abajo.
//  - DirectionalLight: el "sol". Es la única de las dos que proyecta sombras.
const luzAmbiente = new THREE.HemisphereLight(0xffffff, 0x7caa5c, 2.2);
scene.add(luzAmbiente);

const luzSol = new THREE.DirectionalLight(0xffffff, 2.6);
luzSol.castShadow = true;
luzSol.shadow.mapSize.set(2048, 2048);     // resolución de la sombra
luzSol.shadow.camera.left = -22;           // zona que recibe sombras
luzSol.shadow.camera.right = 22;
luzSol.shadow.camera.top = 15;
luzSol.shadow.camera.bottom = -10;
luzSol.shadow.camera.near = 1;
luzSol.shadow.camera.far = 60;
scene.add(luzSol);
scene.add(luzSol.target);                  // el objetivo de la luz también va en la escena


/* =====================================================================
   4. TEXTURAS DESDE IMÁGENES
   - TextureLoader descarga una imagen y la convierte en textura.
   - La carga es ASÍNCRONA: load() devuelve la textura de inmediato (vacía)
     y la imagen llega después. Por eso usamos un LoadingManager, que nos
     avisa cuando TODAS las imágenes terminaron de cargar.
   - Las rutas son relativas al index.html (no a este archivo .js).
     Por eso escribimos './src/img/texture/' y no '../img/texture/'.
   ===================================================================== */
const RUTA_TEXTURAS = './src/img/texture/';

// 1. El LoadingManager vigila todas las cargas
const manager = new THREE.LoadingManager();

manager.onProgress = (url, cargadas, total) => {
    // Mostramos el progreso en el botón de jugar
    const boton = document.getElementById('btn-jugar');
    if (boton) boton.textContent = `CARGANDO ${cargadas}/${total}`;
};

manager.onLoad = () => {
    // Todas las texturas listas: habilitamos el botón
    const boton = document.getElementById('btn-jugar');
    if (boton) { boton.textContent = 'JUGAR'; boton.disabled = false; }
};

manager.onError = (url) => {
    // Error típico: la ruta está mal escrita o el archivo no existe.
    console.error(`No se pudo cargar la textura: ${url}. Revisa la ruta y el nombre del archivo.`);
};

// 2. Crear el cargador de texturas usando el manager
const textureLoader = new THREE.TextureLoader(manager);

// 3. Función de ayuda: carga una imagen y la configura
function cargarTextura(archivo) {
    // El segundo parámetro de load() es una función que se ejecuta cuando la imagen YA llegó
    const textura = textureLoader.load(RUTA_TEXTURAS + archivo, (tex) => {
        // Corrección de proporción: cada cara del cubo es cuadrada (1x1).
        // Si la imagen no es cuadrada (ej. ladrillo.jpg es 1024x512), se vería
        // estirada. Con repeat mostramos solo una porción cuadrada de la imagen.
        const { width, height } = tex.image;
        if (width > height) tex.repeat.set(height / width, 1);   // más ancha: recortamos en X
        if (height > width) tex.repeat.set(1, width / height);   // más alta: recortamos en Y
    });
    // Indica que la imagen está en sRGB. Sin esto los colores se ven lavados.
    textura.colorSpace = THREE.SRGBColorSpace;
    // Filtrado anisotrópico: la textura se ve nítida aunque la cara esté inclinada
    // respecto a la cámara (por ejemplo, el pasto visto desde arriba en ángulo).
    textura.anisotropy = renderer.capabilities.getMaxAnisotropy();
    // Para un look pixel-art se usaría: textura.magFilter = THREE.NearestFilter;
    // Con fotos realistas dejamos el filtro por defecto (LinearFilter), que suaviza.
    return textura;
}

const texTierra    = cargarTextura('ground.jpg');
// La tierra de relleno es una caja de 1x4: si usamos la imagen una sola vez,
// se ve estirada 4 veces hacia abajo. Con RepeatWrapping + repeat(1, 4)
// la imagen se REPITE 4 veces en vertical y conserva su proporción.
// (El navegador guarda la imagen en caché: cargarla dos veces no la descarga dos veces.)
const texTierraRelleno = cargarTextura('ground.jpg');
texTierraRelleno.wrapS = THREE.RepeatWrapping;
texTierraRelleno.wrapT = THREE.RepeatWrapping;
texTierraRelleno.repeat.set(1, 4);
const texSuelo     = cargarTextura('pasto.jpg');       // parte de arriba del suelo
const texSueloLado = cargarTextura('suelo-lado.jpg');  // lados del suelo (ground + borde de pasto)
const texLadrillo  = cargarTextura('ladrillo.jpg');
const texSorpresa  = cargarTextura('sorpresa.jpg');
const texUsado     = cargarTextura('usado.jpg');
const texPiedra    = cargarTextura('piedra.jpg');
const texColumna   = cargarTextura('columna.jpg');

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


/* =====================================================================
   5. MODELOS 3D
   Personajes hechos juntando primitivas dentro de un THREE.Group.
   ===================================================================== */

// Ayuda: crea una malla, la ubica y activa sombras
function pieza(geometria, material, x, y, z) {
    const malla = new THREE.Mesh(geometria, material);
    malla.position.set(x, y, z);
    malla.castShadow = true;
    return malla;
}

// ---------- Jugador: "Pixel", un robot explorador ----------
function crearModeloJugador() {
    const grupo = new THREE.Group();   // el origen del grupo está en los PIES
    const matCuerpo = new THREE.MeshLambertMaterial({ color: 0x2ec4b6 });
    const matOscuro = new THREE.MeshLambertMaterial({ color: 0x1b2a41 });
    const matLuz = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x664400 });
    const matOjo = new THREE.MeshBasicMaterial({ color: 0x7df9ff });  // Basic = no le afecta la luz

    const piernaIzq = pieza(new THREE.BoxGeometry(0.16, 0.2, 0.22), matOscuro, -0.14, 0.1, 0);
    const piernaDer = pieza(new THREE.BoxGeometry(0.16, 0.2, 0.22), matOscuro, 0.14, 0.1, 0);
    const cuerpo = pieza(new THREE.BoxGeometry(0.6, 0.4, 0.48), matCuerpo, 0, 0.4, 0);
    const cabeza = pieza(new THREE.BoxGeometry(0.56, 0.34, 0.5), matCuerpo, 0, 0.77, 0);
    const visor = pieza(new THREE.BoxGeometry(0.46, 0.2, 0.04), matOscuro, 0, 0.78, 0.26);
    const ojoIzq = pieza(new THREE.BoxGeometry(0.08, 0.1, 0.02), matOjo, -0.1, 0.79, 0.285);
    const ojoDer = pieza(new THREE.BoxGeometry(0.08, 0.1, 0.02), matOjo, 0.1, 0.79, 0.285);
    const antena = pieza(new THREE.CylinderGeometry(0.025, 0.025, 0.2), matOscuro, 0, 1.03, 0);
    const foco = pieza(new THREE.SphereGeometry(0.07, 12, 12), matLuz, 0, 1.15, 0);
    const mochila = pieza(new THREE.BoxGeometry(0.4, 0.32, 0.14), matLuz, 0, 0.42, -0.3);

    grupo.add(piernaIzq, piernaDer, cuerpo, cabeza, visor, ojoIzq, ojoDer, antena, foco, mochila);
    grupo.userData = { piernaIzq, piernaDer };   // guardamos las piernas para animarlas
    return grupo;
}

// ---------- Enemigo: un "blob" morado ----------
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


/* =====================================================================
   6. CONSTRUCCIÓN DEL NIVEL
   Recorremos el mapa de texto y creamos un objeto por cada carácter.
   Los bloques sólidos se guardan en un Map con la clave "x,y" para
   encontrarlos rápido al calcular colisiones.
   IMPORTANTE: construirNivel() se llama UNA vez al iniciar la partida,
   nunca dentro de animate(). Si se llamara en cada cuadro, crearíamos
   cientos de mallas 60 veces por segundo y el juego se volvería lento.
   ===================================================================== */
let grupoNivel = null,
    bloques = new Map(),             // "x,y" -> { x, y, tipo, malla, rebote }
    gemas = [],
    enemigos = [],
    particulas = [],
    posicionInicial = { x: 2.5, y: 1 },
    puntoControl = null,             // { x, y, bandera, activo }
    banderaMeta = null;              // { x, bandera }

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
    puntoControl = null;
    banderaMeta = null;

    const alto = MAPA_NIVEL.length;
    MAPA_NIVEL.forEach((fila, y) => {
        // Invertir el eje Y: la fila 0 del arreglo es la de ARRIBA del nivel
        const yMundo = alto - 1 - y;

        for (let index = 0; index < fila.length; index++) {
            const element = fila[index];

            if (SOLIDOS.has(element)) {
                crearBloque(index, yMundo, element);         // bloque sólido
            } else if (element === "o") {
                crearGema(index, yMundo);
            } else if (element === "E") {
                crearEnemigo(index, yMundo);
            } else if (element === "P") {
                posicionInicial = { x: index + 0.5, y: yMundo };
            } else if (element === "K") {
                const bandera = crearBandera(2, 0x9e9e9e);   // gris hasta que se active
                bandera.position.set(index + 0.5, yMundo, 0);
                grupoNivel.add(bandera);
                puntoControl = { x: index + 0.5, y: yMundo, bandera, activo: false };
            } else if (element === "F") {
                const bandera = crearBandera(6, 0xff595e);
                bandera.position.set(index + 0.5, yMundo, 0);
                grupoNivel.add(bandera);
                banderaMeta = { x: index + 0.5, bandera };
            }
        }
    });
}

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

function crearGema(x, y) {
    const malla = new THREE.Mesh(GEO_GEMA, MATERIALES.gema);
    malla.position.set(x + 0.5, y + 0.5, 0);
    malla.castShadow = true;
    grupoNivel.add(malla);
    gemas.push({ x, y, malla, recogida: false });
}

function crearEnemigo(x, y) {
    const malla = crearModeloEnemigo();
    grupoNivel.add(malla);
    enemigos.push({
        x: x + 0.5, y: y,          // x = centro, y = base (pies)
        vx: 0, vy: 0,
        ancho: 0.8, alto: 0.7,     // caja de colisión
        direccion: -1,             // empieza caminando a la izquierda
        vivo: true,
        tiempoMuerto: 0,
        malla,
    });
}

/* =====================================================================
   7. ENTRADA DEL TECLADO
   Guardamos qué teclas están presionadas; en cada cuadro preguntamos.
   ===================================================================== */
const teclas = {};

window.addEventListener('keydown', (e) => {
    teclas[e.code] = true;

    // Evita que la página haga scroll con espacio o flechas
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();

    // "Buffer" de salto: recordamos que el jugador quiso saltar
    if (!e.repeat && esTeclaSalto(e.code) && estado === 'jugando') {
        jugador.bufferSalto = CONFIG.BUFFER_SALTO;
    }

    if (e.code === 'KeyP') alternarPausa();
    if (e.code === 'KeyR' && estado !== 'inicio') iniciarJuego();
});

window.addEventListener('keyup', (e) => { teclas[e.code] = false; });

const esTeclaSalto = (code) => code === 'Space' || code === 'ArrowUp' || code === 'KeyW';
const teclaIzquierda = () => teclas['ArrowLeft'] || teclas['KeyA'];
const teclaDerecha = () => teclas['ArrowRight'] || teclas['KeyD'];
const teclaSaltoPresionada = () => teclas['Space'] || teclas['ArrowUp'] || teclas['KeyW'];
const teclaCorrer = () => teclas['ShiftLeft'] || teclas['ShiftRight'];


/* =====================================================================
   8. FÍSICA Y COLISIONES (AABB contra la grilla)
   Movemos primero en X y resolvemos choques, y LUEGO en Y.
   Separar los ejes evita que el personaje se "pegue" en las esquinas.
   Toda entidad tiene: x (centro), y (pies), ancho, alto, vx, vy.
   ===================================================================== */
function obtenerBloque(tx, ty) {
    return bloques.get(clave(tx, ty)) || null;
}

// Devuelve los bloques sólidos que se cruzan con la caja de la entidad
function bloquesQueToca(ent) {
    const resultado = [];
    const izquierda = Math.floor(ent.x - ent.ancho / 2);
    const derecha = Math.floor(ent.x + ent.ancho / 2 - 0.001);
    const abajo = Math.floor(ent.y);
    const arriba = Math.floor(ent.y + ent.alto - 0.001);

    for (let tx = izquierda; tx <= derecha; tx++) {
        for (let ty = abajo; ty <= arriba; ty++) {
            const b = obtenerBloque(tx, ty);
            if (b) resultado.push(b);
        }
    }
    return resultado;
}

// Mueve una entidad y la saca de los bloques con los que choque.
// alGolpearTecho: función opcional (callback) si choca con la cabeza.
function moverEntidad(ent, dt, alGolpearTecho) {
    ent.chocoPared = false;

    // --- Eje X ---
    ent.x += ent.vx * dt;
    let choques = bloquesQueToca(ent);
    if (choques.length > 0) {
        if (ent.vx > 0) {
            ent.x = Math.min(...choques.map(b => b.x)) - ent.ancho / 2 - 0.001;
        } else if (ent.vx < 0) {
            ent.x = Math.max(...choques.map(b => b.x)) + 1 + ent.ancho / 2 + 0.001;
        }
        ent.vx = 0;
        ent.chocoPared = true;
    }

    // --- Eje Y ---
    ent.y += ent.vy * dt;
    ent.enSuelo = false;
    choques = bloquesQueToca(ent);
    if (choques.length > 0) {
        if (ent.vy < 0) {
            // Cayendo: aterriza encima del bloque
            ent.y = Math.max(...choques.map(b => b.y)) + 1;
            ent.enSuelo = true;
        } else if (ent.vy > 0) {
            // Subiendo: se golpea la cabeza
            ent.y = Math.min(...choques.map(b => b.y)) - ent.alto - 0.001;
            if (alGolpearTecho) alGolpearTecho(choques);
        }
        ent.vy = 0;
    }
}

// ¿Se superponen dos cajas? (prueba AABB)
function seSuperponen(a, b) {
    return Math.abs(a.x - b.x) < (a.ancho + b.ancho) / 2 &&
           a.y < b.y + b.alto &&
           a.y + a.alto > b.y;
}


/* =====================================================================
   9. BLOQUES: ROMPER LADRILLOS Y BLOQUES SORPRESA
   ===================================================================== */
function golpearBloque(listaBloques) {
    // Si la cabeza toca dos bloques, golpeamos el más cercano al centro del jugador
    const bloque = listaBloques.reduce((mejor, b) =>
        Math.abs(b.x + 0.5 - jugador.x) < Math.abs(mejor.x + 0.5 - jugador.x) ? b : mejor);

    if (bloque.tipo === 'B') {
        destruirBloque(bloque);
    } else if (bloque.tipo === 'G') {
        // Bloque sorpresa: suelta una gema y queda "usado" (cambia su textura)
        bloque.tipo = 'U';
        bloque.malla.material = MATERIALES.usado;
        bloque.rebote = 0.2;
        gemaQueSalta(bloque.x, bloque.y + 1);
        sumarGema(100);
    } else {
        bloque.rebote = 0.1;
    }

    // Si había un enemigo parado sobre el bloque golpeado, ¡también lo derrota!
    enemigos.forEach(en => {
        if (en.vivo && Math.floor(en.x) === bloque.x && Math.abs(en.y - (bloque.y + 1)) < 0.1) {
            derrotarEnemigo(en, 100);
        }
    });
}

function destruirBloque(bloque) {
    grupoNivel.remove(bloque.malla);                 // lo quitamos de la escena
    bloques.delete(clave(bloque.x, bloque.y));       // y del mapa de colisiones
    crearParticulas(bloque.x + 0.5, bloque.y + 0.5, MATERIALES.ladrillo, 8);
    puntos += 50;
}

// Gema que sale de un bloque sorpresa (sube, gira y desaparece)
function gemaQueSalta(x, y) {
    const malla = new THREE.Mesh(GEO_GEMA, MATERIALES.gema);
    malla.position.set(x + 0.5, y + 0.3, 0);
    grupoNivel.add(malla);
    particulas.push({ malla, vx: 0, vy: 8, vz: 0, vida: 0.5, gira: 15, gravedad: -20 });
}

function sumarGema(puntosExtra) {
    gemasRecogidas++;
    puntos += puntosExtra;
    // Cada 20 gemas, ¡una vida extra!
    if (gemasRecogidas % 20 === 0) {
        vidas++;
        mostrarAviso('¡VIDA EXTRA!');
    }
}


/* =====================================================================
   10. JUGADOR
   ===================================================================== */
const jugador = {
    x: 0, y: 0, vx: 0, vy: 0,
    ancho: 0.7, alto: 0.9,
    enSuelo: false,
    mirando: 1,               // 1 = derecha, -1 = izquierda
    tiempoCoyote: 0,
    bufferSalto: 0,
    saltando: false,
    invulnerable: 0,
    tiempoAnimacion: 0,
    malla: crearModeloJugador(),
};
scene.add(jugador.malla);

function reaparecerJugador() {
    // Si activamos el punto de control, reaparecemos ahí
    const inicio = (puntoControl && puntoControl.activo) ? puntoControl : posicionInicial;
    jugador.x = inicio.x;
    jugador.y = inicio.y;
    jugador.vx = 0;
    jugador.vy = 0;
    jugador.mirando = 1;
    jugador.invulnerable = CONFIG.INVULNERABLE;
    jugador.malla.rotation.set(0, 0, 0);
    jugador.malla.visible = true;
}

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
        // Fricción: reducimos la velocidad poco a poco hasta 0
        const freno = CONFIG.FRICCION * dt;
        j.vx = Math.abs(j.vx) <= freno ? 0 : j.vx - Math.sign(j.vx) * freno;
    }

    // --- Salto (con coyote time y buffer) ---
    j.tiempoCoyote = j.enSuelo ? CONFIG.TIEMPO_COYOTE : j.tiempoCoyote - dt;
    j.bufferSalto -= dt;

    if (j.bufferSalto > 0 && j.tiempoCoyote > 0) {
        j.vy = CONFIG.FUERZA_SALTO;
        j.bufferSalto = 0;
        j.tiempoCoyote = 0;
        j.saltando = true;
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

    // --- Punto de control (K): se activa al pasar por él ---
    if (puntoControl && !puntoControl.activo && j.x >= puntoControl.x) {
        puntoControl.activo = true;
        puntoControl.bandera.userData.tela.material.color.set(0x4caf50); // se pone verde
        mostrarAviso('¡PUNTO DE CONTROL!');
    }

    // --- Meta (F) ---
    if (banderaMeta && j.x >= banderaMeta.x - 0.2) {
        ganarNivel();
    }

    if (j.invulnerable > 0) j.invulnerable -= dt;
    actualizarModeloJugador(dt);
}

// Sincroniza el modelo 3D con los datos del jugador y lo anima
function actualizarModeloJugador(dt) {
    const j = jugador;
    const m = j.malla;
    m.position.set(j.x, j.y, 0);

    // Girar suavemente hacia donde mira (sin llegar a 90° para que se vea la cara)
    const anguloObjetivo = j.mirando * 0.9;
    m.rotation.y += (anguloObjetivo - m.rotation.y) * Math.min(1, 12 * dt);

    // Animación de caminar: las piernas suben y bajan con una función seno
    const { piernaIzq, piernaDer } = m.userData;
    if (j.enSuelo && Math.abs(j.vx) > 0.5) {
        j.tiempoAnimacion += dt * Math.abs(j.vx) * 2.2;
        piernaIzq.position.y = 0.1 + Math.max(0, Math.sin(j.tiempoAnimacion)) * 0.08;
        piernaDer.position.y = 0.1 + Math.max(0, -Math.sin(j.tiempoAnimacion)) * 0.08;
    } else {
        piernaIzq.position.y = piernaDer.position.y = 0.1;
    }

    // "Squash & stretch": se estira al subir y se aplasta al caer
    const estirar = j.enSuelo ? 1 : 1 + Math.max(-0.15, Math.min(0.15, j.vy * 0.015));
    m.scale.set(2 - estirar, estirar, 2 - estirar);

    // Parpadeo mientras es invulnerable
    m.visible = j.invulnerable > 0 ? Math.floor(j.invulnerable * 12) % 2 === 0 : true;
}

// Se llama cuando el jugador recibe daño o se cae
function perderVida(conAnimacion) {
    if (estado !== 'jugando') return;
    vidas--;
    estado = 'muriendo';
    tiempoMuerte = 1.4;
    jugador.malla.visible = true;
    // Animación clásica: sale disparado hacia arriba y cae fuera de la pantalla
    jugador.vy = conAnimacion ? 12 : 0;
    jugador.vx = 0;
}

function actualizarMuerte(dt) {
    tiempoMuerte -= dt;
    jugador.vy += CONFIG.GRAVEDAD * dt;
    jugador.y += jugador.vy * dt;               // sin colisiones: atraviesa el suelo
    jugador.malla.position.set(jugador.x, jugador.y, 0);
    jugador.malla.rotation.z += dt * 8;          // da vueltas

    if (tiempoMuerte <= 0) {
        if (vidas <= 0) {
            terminarJuego(false);
        } else {
            reaparecerJugador();
            tiempoRestante = CONFIG.TIEMPO_NIVEL;
            estado = 'jugando';
        }
    }
}


/* =====================================================================
   11. ENEMIGOS
   Caminan de lado a lado; dan media vuelta en paredes y bordes.
   Si el jugador les cae encima, mueren.
   ===================================================================== */
function actualizarEnemigos(dt, tiempo) {
    enemigos.forEach(en => {
        // Enemigo aplastado: esperamos un momento y lo quitamos
        if (!en.vivo) {
            en.tiempoMuerto -= dt;
            if (en.tiempoMuerto <= 0 && en.malla.parent) grupoNivel.remove(en.malla);
            return;
        }

        // Solo se activan cuando están cerca del jugador
        if (Math.abs(en.x - jugador.x) > 18) return;

        en.vx = en.direccion * CONFIG.VEL_ENEMIGO;
        en.vy += CONFIG.GRAVEDAD * dt;
        moverEntidad(en, dt);

        // Media vuelta al chocar con una pared
        if (en.chocoPared) en.direccion *= -1;

        // Media vuelta si adelante no hay suelo (no se cae de las plataformas)
        if (en.enSuelo) {
            const pieDelantero = Math.floor(en.x + en.direccion * (en.ancho / 2 + 0.05));
            if (!obtenerBloque(pieDelantero, Math.floor(en.y - 0.1))) en.direccion *= -1;
        }

        if (en.y < CONFIG.LIMITE_CAIDA) { en.vivo = false; en.tiempoMuerto = 0; }

        // Animación: rebota un poquito y mira hacia donde va
        en.malla.position.set(en.x, en.y, 0);
        en.malla.scale.y = 1 + Math.sin(tiempo * 12) * 0.08;
        en.malla.rotation.y = en.direccion * 0.6;

        // --- Colisión con el jugador ---
        if (estado === 'jugando' && seSuperponen(jugador, en)) {
            const cayendoEncima = jugador.vy < 0 && jugador.y > en.y + en.alto * 0.4;
            if (cayendoEncima) {
                derrotarEnemigo(en, 200);
                jugador.vy = CONFIG.FUERZA_SALTO * 0.65;   // rebote al pisarlo
                jugador.saltando = teclaSaltoPresionada();
            } else if (jugador.invulnerable <= 0) {
                perderVida(true);
            }
        }
    });
}

function derrotarEnemigo(en, puntosGanados) {
    en.vivo = false;
    en.tiempoMuerto = 0.5;
    en.malla.scale.set(1.2, 0.25, 1.2);   // queda aplastado
    puntos += puntosGanados;
}


/* =====================================================================
   12. PARTÍCULAS Y ANIMACIONES DEL NIVEL
   Los pedacitos usan el MISMO material del ladrillo: así llevan su
   textura de imagen y parecen trozos reales del bloque.
   ===================================================================== */
const GEO_PEDAZO = new THREE.BoxGeometry(0.25, 0.25, 0.25);

function crearParticulas(x, y, material, cantidad) {
    for (let i = 0; i < cantidad; i++) {
        const malla = new THREE.Mesh(GEO_PEDAZO, material);
        malla.position.set(x, y, 0);
        grupoNivel.add(malla);
        particulas.push({
            malla,
            vx: (Math.random() - 0.5) * 6,
            vy: 5 + Math.random() * 5,
            vz: (Math.random() - 0.5) * 6,
            vida: 1.2,
            gira: 10,
            gravedad: CONFIG.GRAVEDAD,
        });
    }
}

function actualizarParticulas(dt) {
    // Recorremos al revés para poder borrar del arreglo sin saltarnos elementos
    for (let i = particulas.length - 1; i >= 0; i--) {
        const p = particulas[i];
        p.vy += p.gravedad * dt;
        p.malla.position.x += p.vx * dt;
        p.malla.position.y += p.vy * dt;
        p.malla.position.z += p.vz * dt;
        p.malla.rotation.x += p.gira * dt;
        p.malla.rotation.y += p.gira * dt;
        p.vida -= dt;
        if (p.vida <= 0) {
            grupoNivel.remove(p.malla);
            particulas.splice(i, 1);
        }
    }
}

// Bloques que "rebotan" al golpearlos, gemas que giran y bandera que ondea
function animarNivel(dt, tiempo) {
    bloques.forEach(b => {
        if (b.rebote > 0) {
            b.rebote -= dt;
            b.malla.position.y = b.y + 0.5 + Math.sin(Math.max(0, b.rebote) * 15) * 0.15;
        }
    });
    gemas.forEach(g => {
        if (!g.recogida) {
            g.malla.rotation.y = tiempo * 2;
            g.malla.position.y = g.y + 0.5 + Math.sin(tiempo * 3 + g.x) * 0.08;
        }
    });
    if (banderaMeta) banderaMeta.bandera.userData.tela.rotation.y = Math.sin(tiempo * 3) * 0.25;
}


/* =====================================================================
   13. CÁMARA QUE SIGUE AL JUGADOR
   Interpolación (lerp): en cada cuadro la cámara recorre un porcentaje
   de la distancia hacia su objetivo → movimiento suave.
   ===================================================================== */
function actualizarCamara(dt) {
    const suavizado = Math.min(1, 5 * dt);
    const objetivoX = Math.max(8, jugador.x + 2);         // un poco adelante del jugador
    const objetivoY = Math.max(4.5, jugador.y + 3);

    camera.position.x += (objetivoX - camera.position.x) * suavizado;
    camera.position.y += (objetivoY - camera.position.y) * suavizado;
    camera.position.z = 14;
    camera.lookAt(camera.position.x, camera.position.y - 2, 0);

    moverSol();
}

// La luz del sol sigue a la cámara para que siempre haya sombras cerca
function moverSol() {
    luzSol.position.set(camera.position.x - 6, 18, 12);
    luzSol.target.position.set(camera.position.x, 0, 0);
}


/* =====================================================================
   14. INTERFAZ: HUD Y PANTALLAS
   Necesita estos id en index.html: hud-vidas, hud-gemas, hud-puntos,
   hud-tiempo, aviso, pantalla-inicio, pantalla-pausa, pantalla-fin,
   fin-titulo, fin-detalle, btn-jugar, btn-reiniciar.
   ===================================================================== */
const ui = {
    vidas: document.getElementById('hud-vidas'),
    gemas: document.getElementById('hud-gemas'),
    puntos: document.getElementById('hud-puntos'),
    tiempo: document.getElementById('hud-tiempo'),
    aviso: document.getElementById('aviso'),
    inicio: document.getElementById('pantalla-inicio'),
    pausa: document.getElementById('pantalla-pausa'),
    fin: document.getElementById('pantalla-fin'),
    finTitulo: document.getElementById('fin-titulo'),
    finDetalle: document.getElementById('fin-detalle'),
};

function actualizarHUD() {
    ui.vidas.textContent = vidas;   // también se puede probar: '❤'.repeat(vidas)
    ui.gemas.textContent = gemasRecogidas;
    ui.puntos.textContent = String(puntos).padStart(6, '0');   // 000150
    ui.tiempo.textContent = Math.ceil(tiempoRestante);
}

let temporizadorAviso = null;
function mostrarAviso(texto) {
    ui.aviso.textContent = texto;
    ui.aviso.classList.remove('oculto');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => ui.aviso.classList.add('oculto'), 1500);
}

// El botón de jugar empieza deshabilitado hasta que carguen las texturas (ver sección 4)
const botonJugar = document.getElementById('btn-jugar');
botonJugar.disabled = true;
botonJugar.addEventListener('click', iniciarJuego);
document.getElementById('btn-reiniciar').addEventListener('click', iniciarJuego);


/* =====================================================================
   15. ESTADOS DEL JUEGO Y BUCLE PRINCIPAL
   'inicio' -> 'jugando' <-> 'pausa'
              'jugando' -> 'muriendo' -> 'jugando' o 'gameover'
              'jugando' -> 'victoria'
   ===================================================================== */
let estado = 'inicio';
let vidas = CONFIG.VIDAS_INICIALES,
    puntos = 0,
    gemasRecogidas = 0,
    tiempoRestante = CONFIG.TIEMPO_NIVEL,
    tiempoMuerte = 0;

function iniciarJuego() {
    vidas = CONFIG.VIDAS_INICIALES;
    puntos = 0;
    gemasRecogidas = 0;
    tiempoRestante = CONFIG.TIEMPO_NIVEL;

    construirNivel();          // ← UNA sola vez por partida
    reaparecerJugador();
    jugador.invulnerable = 0;
    camera.position.set(8, 4.5, 14);

    ui.inicio.classList.add('oculto');
    ui.fin.classList.add('oculto');
    ui.pausa.classList.add('oculto');
    estado = 'jugando';
}

function alternarPausa() {
    if (estado === 'jugando') {
        estado = 'pausa';
        ui.pausa.classList.remove('oculto');
    } else if (estado === 'pausa') {
        estado = 'jugando';
        ui.pausa.classList.add('oculto');
        reloj.getDelta(); // descartamos el tiempo que pasó en pausa
    }
}

function ganarNivel() {
    const bonus = Math.ceil(tiempoRestante) * 10;   // el tiempo sobrante da puntos
    puntos += bonus;
    terminarJuego(true, bonus);
}

function terminarJuego(gano, bonus = 0) {
    estado = gano ? 'victoria' : 'gameover';
    actualizarHUD();
    ui.finTitulo.textContent = gano ? '¡NIVEL COMPLETADO!' : 'GAME OVER';
    ui.finDetalle.innerHTML = gano
        ? `Puntos: ${puntos}<br>Gemas: ${gemasRecogidas}<br>Bono por tiempo: ${bonus}`
        : `Puntos: ${puntos}<br>Gemas: ${gemasRecogidas}`;
    setTimeout(() => ui.fin.classList.remove('oculto'), gano ? 800 : 200);
}

// ---------- Bucle principal ----------
// renderer.setAnimationLoop(animate) llama a animate ~60 veces por segundo
// (es la versión de Three.js de requestAnimationFrame).
// dt (delta time) = segundos desde el cuadro anterior. Multiplicar las
// velocidades por dt hace que el juego vaya igual en PCs rápidos y lentos.
const reloj = new THREE.Clock();

function animate() {
    const dt = Math.min(reloj.getDelta(), 1 / 30);   // limitamos dt para evitar "teletransportes"
    const tiempo = reloj.elapsedTime;

    if (estado === 'jugando') {
        actualizarJugador(dt);
        actualizarEnemigos(dt, tiempo);
        tiempoRestante -= dt;
        if (tiempoRestante <= 0) { tiempoRestante = 0; perderVida(true); }
    } else if (estado === 'muriendo') {
        actualizarMuerte(dt);
    }

    if (estado !== 'pausa') {
        actualizarParticulas(dt);
        animarNivel(dt, tiempo);
    }

    if (estado !== 'inicio') {
        actualizarCamara(dt);
        actualizarHUD();
    } else {
        // En la pantalla de inicio la cámara recorre el nivel lentamente
        camera.position.set(10 + Math.sin(tiempo * 0.2) * 6, 5, 14);
        camera.lookAt(camera.position.x, 3, 0);
        moverSol();
    }

    renderer.render(scene, camera);
}

// ---------- Arranque ----------
ui.inicio.classList.remove('oculto');   // mostramos el menú de inicio
construirNivel();              // el nivel se ve de fondo en la pantalla de inicio
reaparecerJugador();
actualizarModeloJugador(0);
renderer.setAnimationLoop(animate);   // al final: todo ya está definido
