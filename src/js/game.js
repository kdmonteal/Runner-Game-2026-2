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
    VEL_CORRER:9,
    ACELERACION: 40,
    FRICCION:30,
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
  "                                                                                ",
  "                                      ooo                                       ",
  "         G             ooo           ooooo                                      ",
  "                      BBBBB         ooooooo                                   F ",
  "                                      BBB                   S                 # ",
  "    P    G   G                       E                     SS                 # ",
  "   ###  #######  #   K   #  ##C##   #####   ##B#B##       SSS                ###",
  "################ ################ ################ ################ ################",
];

const SOLIDOS = new Set(["#", "B", "G", "S", "C", "K", "F"]);

const COLOR_CIELO = 0x6ec6ff;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLOR_CIELO);
// FOG
scene.fog = new THREE.Fog(COLOR_CIELO, 25, 60);
const camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.1, 200 );
camera.position.set(5, 5, 14);

const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setAnimationLoop( animate );
document.body.appendChild( renderer.domElement );

window.addEventListener('resize', () => {
    // 1. Actualizar el tamaño del renderizador
    renderer.setSize(window.innerWidth, window.innerHeight);

    // 2. Actualizar la relación de aspecto de la cámara
    camera.aspect = window.innerWidth / window.innerHeight;
    
    // 3. Renderizar los cambios en la matriz de proyección
    camera.updateProjectionMatrix();
});

