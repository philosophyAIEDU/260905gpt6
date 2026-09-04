// ===== 화면 전환 · 공통 Three.js 환경 · 고정 시간 간격 · 미션 저장 =====
// 숫자키/홈 버튼/설정 등 화면 공통 동작은 이 파일에서 관리합니다.
const FIXED_DT = 1 / 120;
const STORAGE_KEY = 'physics_playground_missions';
const SIMS = {
  projectile: { title: '포물선 운동', number: '01', ready: true },
  collision: { title: '충돌과 운동량', number: '02', ready: false, stage: 2 },
  coaster: { title: '롤러코스터 에너지', number: '03', ready: false, stage: 2 },
  orbit: { title: '중력과 행성 궤도', number: '04', ready: false, stage: 3 },
};
const $ = (id) => document.getElementById(id);
let missions = readMissions();
let currentId = null;
let activeSim = null;
let engine = null;
let enginePromise = null;
let viewVersion = 0;
let accumulator = 0;
let previousTime = 0;
let toastTimer = null;

// 개인정보나 API 키를 미션 기록에 넣지 않습니다. 저장이 막혀도 앱은 계속 동작합니다.
function readMissions() {
  const result = Object.fromEntries(Object.keys(SIMS).map((id) => [id, [false, false, false]]));
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const id of Object.keys(result)) {
      result[id] = result[id].map((_, index) => saved?.[id]?.[index] === true);
    }
  } catch { /* 시크릿 모드나 손상된 저장값이면 새 기록으로 시작합니다. */ }
  return result;
}

function refreshStars() {
  let total = 0;
  for (const [id, flags] of Object.entries(missions)) {
    const count = flags.filter(Boolean).length;
    total += count;
    const element = document.querySelector(`[data-stars="${id}"]`);
    if (element) {
      element.innerHTML = flags.map((done) => `<span${done ? ' class="earned"' : ''}>${done ? '★' : '☆'}</span>`).join(' ') + ` <b>${count}/3</b>`;
      element.setAttribute('aria-label', `미션 3개 중 ${count}개 달성`);
    }
  }
  $('total-stars').textContent = total;
}

export function showToast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}

function awardMission(id, index) {
  if (missions[id][index]) return;
  missions[id][index] = true;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(missions)); }
  catch { /* 저장을 사용할 수 없으면 현재 화면 안에서만 별을 유지합니다. */ }
  refreshStars();
  showToast('⭐ 미션 성공! 새로운 발견을 했어요.');
}

// CDN 연결에 실패해도 홈과 오류 안내는 작동하도록 3D 모듈을 늦게 불러옵니다.
async function getEngine() {
  if (engine) return engine;
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const [THREE, { OrbitControls }] = await Promise.all([
      import('three'), import('three/addons/controls/OrbitControls.js'),
    ]);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label', '포물선 운동 3D 장면. 마우스 드래그로 회전하고 휠로 확대합니다.');
    renderer.domElement.setAttribute('tabindex', '0');
    $('canvas-container').appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 12000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 20;
    controls.maxDistance = 7000;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    engine = { THREE, renderer, camera, controls, scene: null };
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      showCanvasError('3D 화면 연결이 잠시 끊겼어요. 다시 불러오기 버튼을 눌러 주세요.');
      activeSim?.pause?.();
    });
    resizeCanvas();
    return engine;
  })();
  try { return await enginePromise; }
  catch (error) { enginePromise = null; throw error; }
}

function resizeCanvas() {
  if (!engine || $('simulation-screen').hidden) return;
  const width = $('canvas-container').clientWidth;
  const height = $('canvas-container').clientHeight;
  if (!width || !height) return;
  engine.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  engine.renderer.setSize(width, height, false);
  engine.camera.aspect = width / height;
  engine.camera.updateProjectionMatrix();
}

function showCanvasError(message) {
  $('canvas-error-detail').textContent = message;
  $('canvas-error').hidden = false;
}

async function openSimulation(id) {
  const info = SIMS[id];
  if (!info) return;
  if (!info.ready) {
    showToast(`${info.title} 실험은 ${info.stage}단계에서 완성할 예정이에요.`);
    return;
  }
  const version = ++viewVersion;
  activeSim?.dispose();
  activeSim = null;
  currentId = id;
  if (engine) engine.scene = null;
  $('home-screen').hidden = true;
  $('simulation-screen').hidden = false;
  $('canvas-error').hidden = true;
  $('sim-title').textContent = info.title;
  $('sim-number').textContent = `EXPERIMENT ${info.number}`;
  $('sim-controls').textContent = '실험 도구를 준비하고 있어요…';
  $('trajectory-legend').replaceChildren();
  $('scene-message').textContent = '3D 실험실을 준비하고 있어요…';
  $('scene-message').classList.remove('success');
  history.replaceState(null, '', `#${id}`);
  window.scrollTo({ top: 0, behavior: 'instant' });
  try {
    const ctx = await getEngine();
    const { createProjectile } = await import('./sims/projectile.js');
    if (version !== viewVersion) return;
    ctx.scene = new ctx.THREE.Scene();
    activeSim = createProjectile({
      ...ctx,
      panel: $('sim-controls'),
      missionFlags: missions[id],
      award: (index) => awardMission(id, index),
      notify: showToast,
      setMessage(message, success = false) {
        $('scene-message').textContent = message;
        $('scene-message').classList.toggle('success', success);
      },
    });
    accumulator = 0;
    previousTime = performance.now();
    resizeCanvas();
    activeSim.fitCamera();
    $('sim-title').focus({ preventScroll: true });
  } catch (error) {
    if (version !== viewVersion) return;
    showCanvasError(location.protocol === 'file:'
      ? '파일을 직접 열면 3D 화면이 실행되지 않아요. Python 서버를 실행한 뒤 http://localhost:8000에서 열어 주세요.'
      : '인터넷 연결과 브라우저의 3D 가속 설정을 확인한 뒤 다시 불러와 주세요. 학교망에서 cdn.jsdelivr.net 연결이 막혀 있을 수도 있어요.');
    $('sim-controls').textContent = '3D 연결을 확인하고 다시 불러오면 실험을 시작할 수 있어요.';
    console.error('3D 실험실 초기화 오류:', error);
  }
}

function goHome() {
  ++viewVersion;
  activeSim?.dispose();
  activeSim = null;
  currentId = null;
  if (engine) engine.scene = null;
  $('simulation-screen').hidden = true;
  $('home-screen').hidden = false;
  history.replaceState(null, '', '#home');
  refreshStars();
  $('home-title').focus({ preventScroll: true });
}

// 화면 주사율과 관계없이 물리는 1/120초씩 계산합니다.
// 탭을 숨기면 시간을 멈추며, 복귀 시 숨겨진 시간을 한꺼번에 계산하지 않습니다.
function animate(time) {
  requestAnimationFrame(animate);
  const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.25) : 0;
  previousTime = time;
  if (!activeSim || !engine?.scene || document.hidden) return;
  accumulator += delta;
  while (accumulator >= FIXED_DT) {
    activeSim.update(FIXED_DT);
    accumulator -= FIXED_DT;
  }
  activeSim.render?.(accumulator / FIXED_DT);
  engine.controls.update();
  engine.renderer.render(engine.scene, engine.camera);
}

// AI 선생님은 다음 단계에서 이 함수로 현재 실험의 실제 값을 읽습니다.
export function getCurrentContext() {
  return { simulation: SIMS[currentId]?.title || '홈 화면', ...(activeSim?.getContext() || {}) };
}

document.querySelectorAll('[data-open]').forEach((button) => {
  button.addEventListener('click', () => openSimulation(button.dataset.open));
});
document.querySelector('.brand').addEventListener('click', (event) => { event.preventDefault(); goHome(); });
$('home-button').addEventListener('click', goHome);
$('camera-reset').addEventListener('click', () => activeSim?.fitCamera());
$('retry-button').addEventListener('click', () => location.reload());
$('settings-button').addEventListener('click', () => { activeSim?.pause?.(); $('settings-dialog').showModal(); });
$('settings-close').addEventListener('click', () => $('settings-dialog').close());
$('ai-open-button').addEventListener('click', () => showToast('선생님 설정에서 API 키를 먼저 등록해 주세요. AI 연결은 4단계에서 완성됩니다.'));
document.addEventListener('keydown', async (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.target.closest('input,textarea,select,[contenteditable=true]') || $('settings-dialog').open) return;
  if (/^[1-4]$/.test(event.key)) openSimulation(Object.keys(SIMS)[Number(event.key) - 1]);
  if (event.key.toLowerCase() === 'f') {
    event.preventDefault();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else showToast('이 브라우저에서는 전체화면 단축키를 지원하지 않아요.');
    } catch { showToast('브라우저 메뉴에서 전체화면을 선택해 주세요.'); }
  }
});
window.addEventListener('resize', resizeCanvas);
new ResizeObserver(resizeCanvas).observe($('canvas-container'));
document.addEventListener('visibilitychange', () => { previousTime = performance.now(); accumulator = 0; });
window.addEventListener('pagehide', () => activeSim?.pause?.());
refreshStars();
requestAnimationFrame(animate);
const initialId = location.hash.slice(1);
if (SIMS[initialId]?.ready) openSimulation(initialId);
