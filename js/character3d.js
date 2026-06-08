// character3d.js – Animated 3D stick-figure preview for FitAI demo screen
// Requires Three.js (r128+) loaded before this script.
(function () {
'use strict';

if (typeof THREE === 'undefined') {
  console.warn('[FitAI] Three.js not found – 3D character disabled');
  window.FitAIChar = null;
  return;
}

// ── Exercise → animation type ────────────────────────────────────────────────
const ANIM_TYPE = {
  'Agachamento':'squat','Agachamento Sumô':'squat','Agachamento Plié':'squat',
  'Agachamento Isométrico':'squat','Agachamento com Salto':'jack',
  'Agachamento com Barra':'squat','Agachamento Frontal':'squat',
  'Agachamento Búlgaro':'squat','Agachamento Overhead':'squat',
  'Cadeira Contra Parede':'squat','Leg Press':'squat',
  'Cadeira Extensora':'squat','Leg Curl Deitado':'squat','Pistol Squat':'squat',
  'Adutor':'squat',

  'Flexão':'pushup','Flexão de Joelho':'pushup','Flexão Diamante':'pushup',
  'Flexão Aberta':'pushup','Flexão Declinada':'pushup','Flexão Archer':'pushup',
  'Supino Reto':'pushup','Supino Inclinado':'pushup','Supino Declinado':'pushup',
  'Crucifixo com Halteres':'pushup','Crossover no Cabo':'pushup','Pullover com Halter':'pushup',

  'Polichinelo':'jack','Star Jump':'jack','Burpee':'jack','Skipping':'jack',

  'Avanço':'lunge','Passada Lateral':'lunge','Afundo com Rotação':'lunge',
  'Afundo com Salto':'lunge','Afundo com Joelho Alto':'lunge','Avanço com Halteres':'lunge',

  'Joelho Alto':'highknee','Corrida Estacionária':'highknee','Bear Crawl':'highknee',

  'Ponte de Glúteo':'bridge','Hip Thrust com Barra':'bridge',
  'Donkey Kick':'bridge','Fire Hydrant':'bridge','Chute Traseiro':'bridge',
  'Chute Lateral':'bridge','Glúteo 4 Apoios':'bridge',
  'Glúteo no Cabo':'bridge','Abdução de Quadril':'bridge',

  'Crunch Abdominal':'crunch','Sit-Up Completo':'crunch','Bicicleta Abdominal':'crunch',
  'Russian Twist':'crunch','Elevação de Pernas':'crunch','Tesoura':'crunch',
  'Hiperextensão':'crunch','Superman':'crunch',

  'Prancha':'plank','Prancha Lateral':'plank','Escalador':'plank',
  'Prancha com Toque':'plank','Prancha Dinâmica':'plank',

  'Rosca Direta':'curl','Rosca Alternada':'curl','Rosca Martelo':'curl',
  'Rosca Concentrada':'curl','Rosca no Cabo':'curl','Rosca Scott':'curl',
  'Desenvolvimento com Halteres':'curl','Arnold Press':'curl',
  'Elevação Lateral':'curl','Elevação Frontal':'curl',
  'Face Pull':'curl','Remada Alta':'curl','Pike Push-Up':'curl',

  'Puxada na Polia Alta':'row','Remada Baixa na Polia':'row',
  'Remada Curvada':'row','Boa Manhã':'row','Levantamento Terra':'row','Stiff com Halteres':'row',

  'Tríceps Testa':'tricep','Tríceps Pulley':'tricep','Tríceps Corda':'tricep',
  'Tríceps Francês':'tricep','Mergulho nas Paralelas':'tricep',
  'Tríceps Banco':'tricep','Mergulho entre Cadeiras':'tricep',

  'Elevação de Panturrilha':'calf','Panturrilha no Leg':'calf',
  'Step Up':'step',
};
function animType(name){ return ANIM_TYPE[name] || 'default'; }

// ── Joint / bone structure ───────────────────────────────────────────────────
const JOINTS = ['pelvis','chest','neck','head',
  'lShoulder','lElbow','lWrist',
  'rShoulder','rElbow','rWrist',
  'lHip','lKnee','lAnkle',
  'rHip','rKnee','rAnkle'];

const BONES = [
  ['pelvis','chest'],['chest','neck'],['neck','head'],
  ['chest','lShoulder'],['lShoulder','lElbow'],['lElbow','lWrist'],
  ['chest','rShoulder'],['rShoulder','rElbow'],['rElbow','rWrist'],
  ['pelvis','lHip'],['lHip','lKnee'],['lKnee','lAnkle'],
  ['pelvis','rHip'],['rHip','rKnee'],['rKnee','rAnkle'],
];

// ── Poses (x=left/right, y=up, z=toward camera) ─────────────────────────────
function j(x,y,z){return{x,y,z};}

// Standing ─────────────────────────────────────────────────────────────────
const STAND = {
  pelvis:j(0,.95,0),  chest:j(0,1.35,0),  neck:j(0,1.55,0), head:j(0,1.72,0),
  lShoulder:j(-.22,1.48,0), lElbow:j(-.38,1.18,.04), lWrist:j(-.48,.88,.05),
  rShoulder:j( .22,1.48,0), rElbow:j( .38,1.18,.04), rWrist:j( .48,.88,.05),
  lHip:j(-.12,.93,0), lKnee:j(-.14,.52,0), lAnkle:j(-.12,.05,0),
  rHip:j( .12,.93,0), rKnee:j( .14,.52,0), rAnkle:j( .12,.05,0),
};

// Squat bottom ─────────────────────────────────────────────────────────────
const SQUAT = {
  pelvis:j(0,.42,.05), chest:j(.04,.82,.08), neck:j(.04,1.02,.06), head:j(.04,1.19,.04),
  lShoulder:j(-.18,.92,.08), lElbow:j(-.18,.65,.22), lWrist:j(-.10,.50,.28),
  rShoulder:j( .18,.92,.08), rElbow:j( .18,.65,.22), rWrist:j( .10,.50,.28),
  lHip:j(-.18,.40,.05), lKnee:j(-.25,.22,.22), lAnkle:j(-.18,.05,.02),
  rHip:j( .18,.40,.05), rKnee:j( .25,.22,.22), rAnkle:j( .18,.05,.02),
};

// Jumping jack – open ──────────────────────────────────────────────────────
const JACK = {
  pelvis:j(0,.95,0), chest:j(0,1.35,0), neck:j(0,1.55,0), head:j(0,1.72,0),
  lShoulder:j(-.22,1.48,0), lElbow:j(-.55,1.70,.02), lWrist:j(-.78,1.90,.02),
  rShoulder:j( .22,1.48,0), rElbow:j( .55,1.70,.02), rWrist:j( .78,1.90,.02),
  lHip:j(-.12,.93,0), lKnee:j(-.35,.52,0), lAnkle:j(-.48,.05,0),
  rHip:j( .12,.93,0), rKnee:j( .35,.52,0), rAnkle:j( .48,.05,0),
};

// Lunge – down ─────────────────────────────────────────────────────────────
const LUNGE = {
  pelvis:j(0,.65,.10), chest:j(0,1.05,.05), neck:j(0,1.25,.02), head:j(0,1.42,0),
  lShoulder:j(-.20,1.15,0), lElbow:j(-.38,.90,.05), lWrist:j(-.48,.65,.05),
  rShoulder:j( .20,1.15,0), rElbow:j( .38,.90,.05), rWrist:j( .48,.65,.05),
  lHip:j(-.12,.62,.10), lKnee:j(-.14,.32,.38), lAnkle:j(-.12,.05,.45),
  rHip:j( .12,.62,.10), rKnee:j( .13,.18,-.22), rAnkle:j( .12,.05,-.35),
};

// High knee – left ─────────────────────────────────────────────────────────
const HK_L = {
  pelvis:j(0,.92,0), chest:j(0,1.32,0), neck:j(0,1.52,0), head:j(0,1.68,0),
  lShoulder:j(-.22,1.44,0), lElbow:j(-.40,1.18,.14), lWrist:j(-.50,.92,.22),
  rShoulder:j( .22,1.44,0), rElbow:j( .40,1.18,-.14),rWrist:j( .50,.92,-.22),
  lHip:j(-.12,.90,0), lKnee:j(-.14,1.18,.08), lAnkle:j(-.14,.85,.12),
  rHip:j( .12,.90,0), rKnee:j( .14,.50,0),    rAnkle:j( .12,.05,0),
};

// High knee – right ────────────────────────────────────────────────────────
const HK_R = {
  pelvis:j(0,.92,0), chest:j(0,1.32,0), neck:j(0,1.52,0), head:j(0,1.68,0),
  lShoulder:j(-.22,1.44,0), lElbow:j(-.40,1.18,-.14),lWrist:j(-.50,.92,-.22),
  rShoulder:j( .22,1.44,0), rElbow:j( .40,1.18,.14), rWrist:j( .50,.92,.22),
  lHip:j(-.12,.90,0), lKnee:j(-.14,.50,0),    lAnkle:j(-.12,.05,0),
  rHip:j( .12,.90,0), rKnee:j( .14,1.18,.08), rAnkle:j( .14,.85,.12),
};

// Bridge – lying flat (knees bent) ─────────────────────────────────────────
const BRIDGE_D = {
  head:j(0,.18,.88),   neck:j(0,.14,.70),   chest:j(0,.10,.38),  pelvis:j(0,.08,0),
  lShoulder:j(-.28,.12,.38),lElbow:j(-.48,.10,.30),lWrist:j(-.62,.08,.18),
  rShoulder:j( .28,.12,.38),rElbow:j( .48,.10,.30),rWrist:j( .62,.08,.18),
  lHip:j(-.14,.08,-.05),lKnee:j(-.16,.40,-.25),lAnkle:j(-.15,.06,-.45),
  rHip:j( .14,.08,-.05),rKnee:j( .16,.40,-.25),rAnkle:j( .15,.06,-.45),
};

// Bridge – hips up ─────────────────────────────────────────────────────────
const BRIDGE_U = {
  head:j(0,.20,.88),   neck:j(0,.16,.70),   chest:j(0,.28,.36),  pelvis:j(0,.55,-.05),
  lShoulder:j(-.28,.14,.36),lElbow:j(-.46,.10,.28),lWrist:j(-.60,.08,.16),
  rShoulder:j( .28,.14,.36),rElbow:j( .46,.10,.28),rWrist:j( .60,.08,.16),
  lHip:j(-.15,.50,-.08),lKnee:j(-.16,.38,-.32),lAnkle:j(-.14,.06,-.48),
  rHip:j( .15,.50,-.08),rKnee:j( .16,.38,-.32),rAnkle:j( .14,.06,-.48),
};

// Crunch – flat ────────────────────────────────────────────────────────────
const CRUNCH_D = {
  head:j(0,.18,.88),   neck:j(0,.14,.70),   chest:j(0,.10,.38),  pelvis:j(0,.08,0),
  lShoulder:j(-.24,.10,.38),lElbow:j(-.10,.22,.58),lWrist:j(-.03,.28,.68),
  rShoulder:j( .24,.10,.38),rElbow:j( .10,.22,.58),rWrist:j( .03,.28,.68),
  lHip:j(-.12,.08,-.05),lKnee:j(-.13,.08,-.42),lAnkle:j(-.12,.05,-.80),
  rHip:j( .12,.08,-.05),rKnee:j( .13,.08,-.42),rAnkle:j( .12,.05,-.80),
};

// Crunch – up ──────────────────────────────────────────────────────────────
const CRUNCH_U = {
  head:j(0,.48,.55),  neck:j(0,.34,.55),   chest:j(0,.22,.42),  pelvis:j(0,.10,0),
  lShoulder:j(-.22,.30,.42),lElbow:j(-.10,.40,.52),lWrist:j(-.02,.47,.60),
  rShoulder:j( .22,.30,.42),rElbow:j( .10,.40,.52),rWrist:j( .02,.47,.60),
  lHip:j(-.12,.10,-.05),lKnee:j(-.14,.42,-.18),lAnkle:j(-.13,.06,-.38),
  rHip:j( .12,.10,-.05),rKnee:j( .14,.42,-.18),rAnkle:j( .13,.06,-.38),
};

// Plank ────────────────────────────────────────────────────────────────────
const PLANK_A = {
  head:j(0,.34,.88),  neck:j(0,.28,.70),   chest:j(0,.30,.38),  pelvis:j(0,.22,-.22),
  lShoulder:j(-.24,.34,.38),lElbow:j(-.28,.22,.12),lWrist:j(-.28,.12,-.05),
  rShoulder:j( .24,.34,.38),rElbow:j( .28,.22,.12),rWrist:j( .28,.12,-.05),
  lHip:j(-.12,.20,-.24),lKnee:j(-.13,.16,-.62),lAnkle:j(-.12,.10,-.88),
  rHip:j( .12,.20,-.24),rKnee:j( .13,.16,-.62),rAnkle:j( .12,.10,-.88),
};
const PLANK_B = {
  head:j(0,.32,.88),  neck:j(0,.26,.70),   chest:j(0,.27,.38),  pelvis:j(0,.20,-.22),
  lShoulder:j(-.24,.32,.38),lElbow:j(-.28,.20,.12),lWrist:j(-.28,.10,-.05),
  rShoulder:j( .24,.32,.38),rElbow:j( .28,.20,.12),rWrist:j( .28,.10,-.05),
  lHip:j(-.12,.18,-.24),lKnee:j(-.13,.14,-.62),lAnkle:j(-.12,.08,-.88),
  rHip:j( .12,.18,-.24),rKnee:j( .13,.14,-.62),rAnkle:j( .12,.08,-.88),
};

// Push-up – up ─────────────────────────────────────────────────────────────
const PUSH_U = {
  head:j(0,.42,.90),  neck:j(0,.35,.72),   chest:j(0,.42,.40),  pelvis:j(0,.30,-.28),
  lShoulder:j(-.23,.46,.40),lElbow:j(-.28,.30,.14),lWrist:j(-.28,.14,-.04),
  rShoulder:j( .23,.46,.40),rElbow:j( .28,.30,.14),rWrist:j( .28,.14,-.04),
  lHip:j(-.12,.28,-.30),lKnee:j(-.13,.17,-.67),lAnkle:j(-.12,.10,-.90),
  rHip:j( .12,.28,-.30),rKnee:j( .13,.17,-.67),rAnkle:j( .12,.10,-.90),
};

// Push-up – down ───────────────────────────────────────────────────────────
const PUSH_D = {
  head:j(0,.24,.90),  neck:j(0,.17,.72),   chest:j(0,.20,.40),  pelvis:j(0,.28,-.28),
  lShoulder:j(-.23,.28,.40),lElbow:j(-.38,.25,.36),lWrist:j(-.38,.11,.16),
  rShoulder:j( .23,.28,.40),rElbow:j( .38,.25,.36),rWrist:j( .38,.11,.16),
  lHip:j(-.12,.25,-.30),lKnee:j(-.13,.14,-.67),lAnkle:j(-.12,.08,-.90),
  rHip:j( .12,.25,-.30),rKnee:j( .13,.14,-.67),rAnkle:j( .12,.08,-.90),
};

// Curl – down / up ─────────────────────────────────────────────────────────
const CURL_D = {
  pelvis:j(0,.95,0), chest:j(0,1.35,0), neck:j(0,1.55,0), head:j(0,1.72,0),
  lShoulder:j(-.22,1.48,0),lElbow:j(-.30,1.20,.05),lWrist:j(-.35,.88,.05),
  rShoulder:j( .22,1.48,0),rElbow:j( .30,1.20,.05),rWrist:j( .35,.88,.05),
  lHip:j(-.12,.93,0),lKnee:j(-.14,.52,0),lAnkle:j(-.12,.05,0),
  rHip:j( .12,.93,0),rKnee:j( .14,.52,0),rAnkle:j( .12,.05,0),
};
const CURL_U = {
  pelvis:j(0,.95,0), chest:j(0,1.35,0), neck:j(0,1.55,0), head:j(0,1.72,0),
  lShoulder:j(-.22,1.48,0),lElbow:j(-.30,1.20,.08),lWrist:j(-.25,1.52,.10),
  rShoulder:j( .22,1.48,0),rElbow:j( .30,1.20,.08),rWrist:j( .25,1.52,.10),
  lHip:j(-.12,.93,0),lKnee:j(-.14,.52,0),lAnkle:j(-.12,.05,0),
  rHip:j( .12,.93,0),rKnee:j( .14,.52,0),rAnkle:j( .12,.05,0),
};

// Row – down / up ──────────────────────────────────────────────────────────
const ROW_D = {
  pelvis:j(0,.95,0), chest:j(.12,1.25,0), neck:j(.10,1.45,0), head:j(.08,1.62,0),
  lShoulder:j(-.22,1.35,0),lElbow:j(-.55,1.38,-.05),lWrist:j(-.72,1.35,-.05),
  rShoulder:j( .22,1.35,0),rElbow:j( .55,1.38,-.05),rWrist:j( .72,1.35,-.05),
  lHip:j(-.12,.93,0),lKnee:j(-.14,.52,0),lAnkle:j(-.12,.05,0),
  rHip:j( .12,.93,0),rKnee:j( .14,.52,0),rAnkle:j( .12,.05,0),
};
const ROW_U = {
  pelvis:j(0,.95,0), chest:j(.12,1.25,0), neck:j(.10,1.45,0), head:j(.08,1.62,0),
  lShoulder:j(-.20,1.35,0),lElbow:j(-.42,1.10,-.10),lWrist:j(-.55,.88,-.12),
  rShoulder:j( .20,1.35,0),rElbow:j( .42,1.10,-.10),rWrist:j( .55,.88,-.12),
  lHip:j(-.12,.93,0),lKnee:j(-.14,.52,0),lAnkle:j(-.12,.05,0),
  rHip:j( .12,.93,0),rKnee:j( .14,.52,0),rAnkle:j( .12,.05,0),
};

// Tricep – down / up ───────────────────────────────────────────────────────
const TRI_D = {
  pelvis:j(0,.95,0), chest:j(0,1.35,0), neck:j(0,1.55,0), head:j(0,1.72,0),
  lShoulder:j(-.22,1.48,0),lElbow:j(-.28,1.50,.05),lWrist:j(-.28,1.20,.10),
  rShoulder:j( .22,1.48,0),rElbow:j( .28,1.50,.05),rWrist:j( .28,1.20,.10),
  lHip:j(-.12,.93,0),lKnee:j(-.14,.52,0),lAnkle:j(-.12,.05,0),
  rHip:j( .12,.93,0),rKnee:j( .14,.52,0),rAnkle:j( .12,.05,0),
};
const TRI_U = {
  pelvis:j(0,.95,0), chest:j(0,1.35,0), neck:j(0,1.55,0), head:j(0,1.72,0),
  lShoulder:j(-.22,1.48,0),lElbow:j(-.28,1.50,.05),lWrist:j(-.28,1.82,.02),
  rShoulder:j( .22,1.48,0),rElbow:j( .28,1.50,.05),rWrist:j( .28,1.82,.02),
  lHip:j(-.12,.93,0),lKnee:j(-.14,.52,0),lAnkle:j(-.12,.05,0),
  rHip:j( .12,.93,0),rKnee:j( .14,.52,0),rAnkle:j( .12,.05,0),
};

// Calf raise ───────────────────────────────────────────────────────────────
const CALF_U = {
  pelvis:j(0,.98,0), chest:j(0,1.38,0), neck:j(0,1.58,0), head:j(0,1.75,0),
  lShoulder:j(-.22,1.50,0),lElbow:j(-.38,1.22,.04),lWrist:j(-.48,.92,.05),
  rShoulder:j( .22,1.50,0),rElbow:j( .38,1.22,.04),rWrist:j( .48,.92,.05),
  lHip:j(-.12,.96,0),lKnee:j(-.14,.54,0),lAnkle:j(-.12,.17,0),
  rHip:j( .12,.96,0),rKnee:j( .14,.54,0),rAnkle:j( .12,.17,0),
};

// Step up ──────────────────────────────────────────────────────────────────
const STEP_U = {
  pelvis:j(0,1.12,0), chest:j(0,1.52,0), neck:j(0,1.72,0), head:j(0,1.88,0),
  lShoulder:j(-.22,1.64,0),lElbow:j(-.38,1.36,.04),lWrist:j(-.48,1.06,.05),
  rShoulder:j( .22,1.64,0),rElbow:j( .38,1.36,.04),rWrist:j( .48,1.06,.05),
  lHip:j(-.12,1.10,0),lKnee:j(-.14,.68,0),lAnkle:j(-.12,.36,0),
  rHip:j( .12,1.10,0),rKnee:j( .14,.52,0),rAnkle:j( .12,.05,0),
};

// Sway (default) ───────────────────────────────────────────────────────────
const SWAY = {
  pelvis:j(0,.95,0), chest:j(0,1.35,0), neck:j(0,1.55,0), head:j(0,1.72,0),
  lShoulder:j(-.22,1.48,0),lElbow:j(-.42,1.26,-.06),lWrist:j(-.55,1.02,-.08),
  rShoulder:j( .22,1.48,0),rElbow:j( .42,1.26,-.06),rWrist:j( .55,1.02,-.08),
  lHip:j(-.12,.93,0),lKnee:j(-.14,.52,0),lAnkle:j(-.12,.05,0),
  rHip:j( .12,.93,0),rKnee:j( .14,.52,0),rAnkle:j( .12,.05,0),
};

// ── Animation config table ───────────────────────────────────────────────────
// camY: camera look-at Y target (adjusts for floor vs standing exercises)
const ANIMS = {
  squat:    {a:STAND,   b:SQUAT,   speed:.022, camY:.9},
  pushup:   {a:PUSH_U,  b:PUSH_D,  speed:.025, camY:.44},
  jack:     {a:STAND,   b:JACK,    speed:.030, camY:.9},
  lunge:    {a:STAND,   b:LUNGE,   speed:.022, camY:.75},
  highknee: {a:HK_L,    b:HK_R,    speed:.040, camY:.9},
  bridge:   {a:BRIDGE_D,b:BRIDGE_U,speed:.018, camY:.35},
  crunch:   {a:CRUNCH_D,b:CRUNCH_U,speed:.022, camY:.40},
  plank:    {a:PLANK_A, b:PLANK_B, speed:.008, camY:.38},
  curl:     {a:CURL_D,  b:CURL_U,  speed:.025, camY:.9},
  row:      {a:ROW_D,   b:ROW_U,   speed:.022, camY:.9},
  tricep:   {a:TRI_D,   b:TRI_U,   speed:.025, camY:.9},
  calf:     {a:STAND,   b:CALF_U,  speed:.030, camY:.9},
  step:     {a:STAND,   b:STEP_U,  speed:.022, camY:1.0},
  default:  {a:STAND,   b:SWAY,    speed:.015, camY:.9},
};

// ── Main class ───────────────────────────────────────────────────────────────
class FitAIChar {
  constructor(canvasId) {
    this._canvas = document.getElementById(canvasId);
    if (!this._canvas) { console.warn('[FitAI] canvas #'+canvasId+' not found'); return; }

    this._scene    = new THREE.Scene();
    this._renderer = new THREE.WebGLRenderer({canvas:this._canvas, antialias:true, alpha:true});
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setClearColor(0x000000, 0);

    this._camera = new THREE.PerspectiveCamera(50, 1, 0.1, 30);
    this._camera.position.set(0, .9, 3.2);
    this._camLookY = .9;
    this._camTargY = .9;

    // Lights
    this._scene.add(new THREE.AmbientLight(0x113322, 3));
    const pl = new THREE.PointLight(0x00ff88, 4, 12);
    pl.position.set(0, 2.5, 2);
    this._scene.add(pl);
    const pl2 = new THREE.PointLight(0x2255ff, 2, 8);
    pl2.position.set(-2, 1.5, 1);
    this._scene.add(pl2);

    // Ground glow disc
    const gMesh = new THREE.Mesh(
      new THREE.CircleGeometry(.9, 32),
      new THREE.MeshBasicMaterial({color:0x00ff44, transparent:true, opacity:.07, side:THREE.DoubleSide})
    );
    gMesh.rotation.x = -Math.PI/2;
    gMesh.position.y = .005;
    this._scene.add(gMesh);

    // Materials
    const boneMat  = new THREE.MeshPhongMaterial({color:0x00dd77, emissive:0x002211, shininess:55});
    const jntMat   = new THREE.MeshPhongMaterial({color:0x44ffaa, emissive:0x003322, shininess:90});
    const headMat  = new THREE.MeshPhongMaterial({color:0x22ccaa, emissive:0x002211, shininess:45});

    // Build joints (spheres)
    this._sph = {};
    for (const name of JOINTS) {
      const isHead = name==='head';
      const isBig  = name==='pelvis'||name==='chest';
      const r = isHead?.11 : isBig?.055 : .038;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r,10,7), isHead?headMat:jntMat);
      this._scene.add(m);
      this._sph[name] = m;
    }

    // Build bones (cylinders, unit-height, scaled at runtime)
    this._cyl = {};
    for (const [a,b] of BONES) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(.020,.020,1,8,1), boneMat);
      this._scene.add(m);
      this._cyl[a+'_'+b] = m;
    }

    // State
    this._pA    = STAND;
    this._pB    = SWAY;
    this._t     = 0;
    this._dir   = 1;
    this._spd   = .015;
    this._rotY  = 0;
    this._on    = false;

    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._up = new THREE.Vector3(0,1,0);

    this.resize();
    window.addEventListener('resize', ()=>this.resize());
    this._renderer.setAnimationLoop(()=>this._tick());
  }

  resize() {
    const wrap = this._canvas?.parentElement;
    if (!wrap) return;
    const w = Math.max(wrap.clientWidth||300, 1);
    const h = Math.max(wrap.clientHeight||260, 1);
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w/h;
    this._camera.updateProjectionMatrix();
  }

  playExercise(name) {
    const cfg = ANIMS[animType(name)] || ANIMS.default;
    this._pA       = cfg.a;
    this._pB       = cfg.b;
    this._spd      = cfg.speed;
    this._camTargY = cfg.camY;
    this._t        = 0;
    this._dir      = 1;
    this._on       = true;
  }

  stop() { this._on = false; }

  // Eased lerp between two poses
  _lerp(a, b, t) {
    const e = .5 - .5 * Math.cos(t * Math.PI);
    const out = {};
    for (const k of JOINTS) {
      const pa = a[k]||STAND[k], pb = b[k]||STAND[k];
      out[k] = {x:pa.x+(pb.x-pa.x)*e, y:pa.y+(pb.y-pa.y)*e, z:pa.z+(pb.z-pa.z)*e};
    }
    return out;
  }

  // Orient a unit-Y cylinder to span from p1 to p2
  _placeCyl(key, p1, p2) {
    const m = this._cyl[key];
    if (!m) return;
    const dx=p2.x-p1.x, dy=p2.y-p1.y, dz=p2.z-p1.z;
    const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
    if (len<1e-4){m.visible=false;return;}
    m.visible = true;
    m.scale.y = len;
    m.position.set((p1.x+p2.x)*.5,(p1.y+p2.y)*.5,(p1.z+p2.z)*.5);
    this._v2.set(dx/len, dy/len, dz/len);
    if (this._up.dot(this._v2)<-.9999) {
      m.quaternion.set(1,0,0,0); // antiparallel edge case
    } else {
      m.quaternion.setFromUnitVectors(this._up, this._v2);
    }
  }

  _tick() {
    // Smooth camera Y target transition
    this._camLookY += (this._camTargY - this._camLookY) * .04;
    this._camera.position.y += (this._camLookY - this._camera.position.y) * .03;
    this._camera.lookAt(0, this._camLookY*.75, 0);

    if (!this._on) {
      this._renderer.render(this._scene, this._camera);
      return;
    }

    // Ping-pong pose interpolation
    this._t += this._dir * this._spd;
    if (this._t >= 1){this._t=1; this._dir=-1;}
    if (this._t <= 0){this._t=0; this._dir= 1;}

    // Slow Y-axis rotation for 3D effect
    this._rotY += .007;
    const cy = Math.cos(this._rotY), sy = Math.sin(this._rotY);

    const pose = this._lerp(this._pA, this._pB, this._t);

    // Apply Y rotation (around world Y)
    const rot = {};
    for (const k of JOINTS) {
      const q = pose[k];
      rot[k] = {x: q.x*cy - q.z*sy, y: q.y, z: q.x*sy + q.z*cy};
    }

    for (const k of JOINTS) this._sph[k].position.set(rot[k].x, rot[k].y, rot[k].z);
    for (const [a,b] of BONES) this._placeCyl(a+'_'+b, rot[a], rot[b]);

    this._renderer.render(this._scene, this._camera);
  }
}

window.FitAIChar = FitAIChar;
})();
