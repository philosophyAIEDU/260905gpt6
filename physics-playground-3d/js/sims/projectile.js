import * as THREE from 'three';

// ===== 포물선 운동 수식 =====
// 발사점과 착지점의 높이는 같으며, 공기저항과 공의 크기는 계산에서 무시합니다.
// 길이 m, 시간 s, 속도 m/s, 중력 m/s². 3D 공간의 1단위 = 1m입니다.
export function flightSolution({ angle, speed, gravity }) {
  const radians = angle * Math.PI / 180;
  const vx = Math.abs(angle - 90) < 1e-9 ? 0 : speed * Math.cos(radians);
  const vy = speed * Math.sin(radians);
  const duration = 2 * vy / gravity;
  return { vx, vy, duration, range: vx * duration, maxHeight: vy * vy / (2 * gravity) };
}

export function positionAt(solution, gravity, time) {
  const t = Math.max(0, Math.min(time, solution.duration));
  return { x: solution.vx * t, y: Math.max(0, solution.vy * t - 0.5 * gravity * t * t) };
}

const GRAVITIES = { earth: { label: '지구', g: 9.8, color: '#6de8d2' }, moon: { label: '달', g: 1.6, color: '#c5cded' }, mars: { label: '화성', g: 3.7, color: '#f4b093' } };
const TRAIL_COLORS = [0xffffff, 0x6de8d2, 0xffdf8b];
const TARGET_X = 100;
const HIT_TOLERANCE = 3;
const BALL_RADIUS = 0.8;
const MISSION_TEXT = ['45°로 공을 발사해 보세요.', '100 m 앞의 과녁에 명중시키세요.', '같은 각도·속도로 지구와 달에서 발사하고, 달에서 더 멀리 가는지 확인하세요.'];

export function createProjectile({ scene, camera, controls, panel, missionFlags, award, notify, setMessage }) {
  // 같은 장면을 다시 열어도 이전 이벤트와 GPU 자원이 남지 않게 정리합니다.
  const listeners = new AbortController();
  const settings = { angle: 45, speed: 30, planet: 'earth', gravity: 9.8 };
  const root = new THREE.Group();
  scene.add(root);
  scene.background = new THREE.Color('#183346');
  const hemisphere = new THREE.HemisphereLight(0xd0edff, 0x285044, 2.5);
  scene.add(hemisphere);
  const sunlight = new THREE.DirectionalLight(0xffefd4, 3);
  sunlight.position.set(30, 100, 50);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  Object.assign(sunlight.shadow.camera, { left: -100, right: 250, top: 140, bottom: -140, near: 1, far: 450 });
  sunlight.shadow.normalBias = 0.04;
  scene.add(sunlight);
  scene.add(sunlight.target);
  sunlight.target.position.set(50, 0, 0);

  let ground = null;
  let grid = null;
  let worldExtent = 0;
  let shot = null;
  let running = false;
  let trails = [];
  let nextShotNumber = 1;
  let lastResult = null;
  let earthExperiments = [];
  let uiElapsed = 0;
  let frameStep = 0;

  function mesh(geometry, color, roughness = 0.6) {
    const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.12 }));
    object.castShadow = true;
    object.receiveShadow = true;
    return object;
  }

  // 달에서 긴 궤적이 나와도 격자의 눈금 간격을 바꾸지 않습니다.
  function resizeGround(extent) {
    const size = Math.ceil(Math.max(300, extent * 2.3) / 20) * 20;
    if (size === worldExtent) return;
    worldExtent = size;
    for (const item of [ground, grid]) {
      if (!item) continue;
      root.remove(item);
      item.geometry.dispose();
      item.material.dispose();
    }
    ground = mesh(new THREE.PlaneGeometry(size, size), settings.planet === 'earth' ? 0x2c6557 : settings.planet === 'moon' ? 0x515b72 : 0x785043);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(size / 2 - 60, -0.055, 0);
    ground.castShadow = false;
    root.add(ground);
    grid = new THREE.GridHelper(size, size / 10, 0x9fc7b1, 0x82b4a5);
    grid.position.set(size / 2 - 60, 0, 0);
    grid.material.transparent = true;
    grid.material.opacity = 0.25;
    root.add(grid);
  }

  // 바닥의 거리를 글자로 표시합니다. CanvasTexture는 외부 이미지 없이 생성합니다.
  function label(text, x, z, tint = '#e6f4ea') {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 96;
    const context = canvas.getContext('2d');
    context.font = '600 42px sans-serif';
    context.fillStyle = tint;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 128, 48);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, 0.8, z);
    sprite.scale.set(10, 3.75, 1);
    root.add(sprite);
  }
  for (let x = 0; x <= 200; x += 20) label(`${x} m`, x, 10, x === 100 ? '#ffe1a0' : '#c3e2d5');

  // 대포는 발사 방향을 표현합니다. 공은 바닥의 0m 눈금에서 출발합니다.
  const cannon = new THREE.Group();
  const cannonBase = mesh(new THREE.BoxGeometry(4, 1.2, 3.8), 0x253e4b);
  cannonBase.position.set(-3, 1.1, 0);
  cannon.add(cannonBase);
  for (const z of [-2, 2]) {
    const wheel = mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.6, 24), 0x192c37);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(-3, 1.5, z);
    cannon.add(wheel);
    const hub = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 20), 0x6a9ca0);
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(wheel.position);
    cannon.add(hub);
  }
  const barrelPivot = new THREE.Group();
  barrelPivot.position.set(-3, 2.4, 0);
  const barrel = mesh(new THREE.CylinderGeometry(0.85, 1.1, 5, 24, 1, true), 0x65b5ad);
  barrel.rotation.z = -Math.PI / 2;
  barrel.position.x = 1;
  barrelPivot.add(barrel);
  const muzzleRing = mesh(new THREE.TorusGeometry(0.85, 0.18, 10, 24), 0xabe6d8);
  muzzleRing.rotation.y = Math.PI / 2;
  muzzleRing.position.x = 3.5;
  barrelPivot.add(muzzleRing);
  cannon.add(barrelPivot);
  root.add(cannon);
  // 공의 중심은 반지름만큼 높여 바닥에 파묻히지 않게 표시합니다.
  const flightGroup = new THREE.Group();
  root.add(flightGroup);
  const ball = mesh(new THREE.SphereGeometry(BALL_RADIUS, 24, 16), 0xffd476);
  flightGroup.add(ball);
  ball.visible = false;

  // 100m 과녁은 착지 지점의 ±3m 범위를 나타냅니다.
  const target = new THREE.Group();
  for (const [radius, color, y] of [[3, 0xffcf87, 0.055], [2, 0xef7b72, 0.065], [0.85, 0xffefd6, 0.075]]) {
    const disk = mesh(new THREE.CircleGeometry(radius, 40), color);
    disk.rotation.x = -Math.PI / 2;
    disk.position.y = y;
    target.add(disk);
  }
  target.position.x = TARGET_X;
  root.add(target);
  const flagPole = mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 10), 0xc2d9cd);
  flagPole.position.set(TARGET_X, 4, -5);
  root.add(flagPole);
  const flag = mesh(new THREE.PlaneGeometry(4, 2.4), 0xffdc8a);
  flag.material.side = THREE.DoubleSide;
  flag.position.set(TARGET_X + 2, 6.7, -5);
  root.add(flag);

  panel.innerHTML = `
    <h2 class="panel-title">실험 조건 <small>공기저항 없음</small></h2>
    <div class="control"><div class="control-label"><label for="angle-slider">발사각</label><output id="angle-value" for="angle-slider">45<small>°</small></output></div><input id="angle-slider" type="range" min="0" max="90" step="1" value="45" aria-valuetext="45도"><div class="range-limits"><span>0°</span><span>90°</span></div></div>
    <div class="control"><div class="control-label"><label for="speed-slider">초기 속도</label><output id="speed-value" for="speed-slider">30<small>m/s</small></output></div><input id="speed-slider" type="range" min="5" max="50" step="0.1" value="30" aria-valuetext="초속 30미터"><div class="range-limits"><span>5 m/s</span><span>50 m/s</span></div></div>
    <div class="control"><div class="control-label"><span id="gravity-label">중력</span></div><div class="segmented" role="group" aria-labelledby="gravity-label"><button data-gravity="earth" aria-pressed="true">🌏 지구<small>9.8</small></button><button data-gravity="moon" aria-pressed="false">🌙 달<small>1.6</small></button><button data-gravity="mars" aria-pressed="false">🔴 화성<small>3.7</small></button></div><p class="unit-note">중력 가속도 단위: m/s²</p></div>
    <div class="action-row"><button id="launch-button" class="primary-button">▶ 실행</button><button id="reset-button" class="secondary-button">⟲ 초기화</button></div>
    <hr class="section-divider">
    <div class="measurement-heading"><h3>실시간 측정</h3><span id="measurement-status">발사 대기</span></div>
    <div class="measurements"><div class="measurement"><span>최고 높이</span><output id="height-readout">0.0<small>m</small></output></div><div class="measurement"><span>수평 도달 거리</span><output id="range-readout">0.0<small>m</small></output></div><div class="measurement"><span>체공 시간</span><output id="time-readout">0.00<small>s</small></output></div></div>
    <button id="clear-trails" class="clear-trails">궤적 지우기 <span id="trail-count">(0/3)</span></button>
    <hr class="section-divider">
    <div class="mission-heading"><h3>🎯 탐구 미션</h3><span id="mission-count">0 / 3</span></div>
    <ol class="mission-list">${MISSION_TEXT.map((text, index) => `<li data-mission="${index}"><span class="mission-icon" aria-hidden="true">☆</span><span>${text}</span></li>`).join('')}</ol>
    <p class="mission-tip">과녁 범위는 100 ± 3 m예요. 달과 지구를 비교할 때는 각도와 속도를 그대로 두세요.</p>`;
  const $ = (id) => panel.querySelector(`#${id}`);
  const on = (element, event, callback) => element.addEventListener(event, callback, { signal: listeners.signal });

  function refreshMissions() {
    missionFlags.forEach((done, index) => {
      const item = panel.querySelector(`[data-mission="${index}"]`);
      item.classList.toggle('achieved', done);
      item.querySelector('.mission-icon').textContent = done ? '★' : '☆';
      item.setAttribute('aria-label', `${done ? '달성' : '아직 도전 중'}: ${MISSION_TEXT[index]}`);
    });
    $('mission-count').textContent = `${missionFlags.filter(Boolean).length} / 3`;
  }

  function win(index) { award(index); refreshMissions(); }

  function displayMeasurement(height = 0, range = 0, time = 0) {
    $('height-readout').innerHTML = `${height.toFixed(1)}<small>m</small>`;
    $('range-readout').innerHTML = `${range.toFixed(1)}<small>m</small>`;
    $('time-readout').innerHTML = `${time.toFixed(2)}<small>s</small>`;
  }

  function updateSettingsUI() {
    $('angle-value').innerHTML = `${settings.angle}<small>°</small>`;
    $('speed-value').innerHTML = `${Number(settings.speed.toFixed(1))}<small>m/s</small>`;
    $('angle-slider').value = settings.angle;
    $('speed-slider').value = settings.speed;
    $('angle-slider').setAttribute('aria-valuetext', `${settings.angle}도`);
    $('speed-slider').setAttribute('aria-valuetext', `초속 ${settings.speed}미터`);
    for (const button of panel.querySelectorAll('[data-gravity]')) button.setAttribute('aria-pressed', button.dataset.gravity === settings.planet);
    document.getElementById('environment-label').textContent = `${GRAVITIES[settings.planet].label} · 중력 ${settings.gravity} m/s²`;
    document.getElementById('environment-dot').style.background = GRAVITIES[settings.planet].color;
    barrelPivot.rotation.z = settings.angle * Math.PI / 180;
    if (ground) ground.material.color.set(settings.planet === 'earth' ? 0x2c6557 : settings.planet === 'moon' ? 0x515b72 : 0x785043);
    scene.background.set(settings.planet === 'earth' ? 0x183346 : settings.planet === 'moon' ? 0x151f38 : 0x352a37);
  }

  function lockSettings(locked) {
    for (const input of panel.querySelectorAll('input,[data-gravity]')) input.disabled = locked;
  }

  // 새 조건과 남겨진 궤적 모두가 보이도록 카메라를 맞춥니다.
  function fitCamera() {
    const solutions = [flightSolution(settings), ...trails.map((trail) => trail.solution)];
    const maxX = Math.max(125, ...solutions.map((value) => value.range));
    const maxY = Math.max(35, ...solutions.map((value) => value.maxHeight));
    resizeGround(maxX);
    const aspect = Math.max(0.5, camera.aspect);
    const distance = Math.max(maxX * 0.78 / Math.min(aspect, 1.7), maxY * 1.4, 85);
    const focus = new THREE.Vector3(maxX * 0.43, maxY * 0.30, 0);
    camera.position.set(focus.x + distance * 0.12, focus.y + distance * 0.56, distance * 1.4);
    camera.far = Math.max(12000, distance * 5);
    camera.updateProjectionMatrix();
    controls.target.copy(focus);
    controls.maxDistance = Math.max(3500, distance * 4);
    controls.update();
  }

  // 고정 크기 BufferGeometry에 점을 추가합니다. 매 프레임 새 Line을 만들지 않습니다.
  function newTrail(solution, config) {
    // 최대 비행 시간(달, 50m/s, 90°)에서도 1/60초 간격의 점을 충분히 담습니다.
    const capacity = Math.ceil(solution.duration * 60) + 8;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const material = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: 0.95 });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    flightGroup.add(line);
    return { line, geometry, material, count: 0, distance: 0, last: null, number: nextShotNumber++, solution, config: { ...config } };
  }

  function appendPoint(trail, x, y) {
    const positions = trail.geometry.getAttribute('position');
    if (trail.count >= positions.count) return;
    const point = new THREE.Vector3(x, y + BALL_RADIUS, 0);
    if (trail.last) trail.distance += point.distanceTo(trail.last);
    positions.setXYZ(trail.count, point.x, point.y, point.z);
    const distances = trail.geometry.getAttribute('lineDistance');
    distances.setX(trail.count, trail.distance);
    trail.last = point;
    trail.count++;
    positions.needsUpdate = true;
    distances.needsUpdate = true;
    trail.geometry.setDrawRange(0, trail.count);
  }

  function recolorTrails() {
    const legend = document.getElementById('trajectory-legend');
    legend.replaceChildren();
    trails.forEach((trail, index) => {
      const color = TRAIL_COLORS[trails.length - 1 - index];
      trail.material.color.setHex(color);
      const chip = document.createElement('span');
      chip.className = 'trajectory-chip';
      const dot = document.createElement('i');
      dot.style.backgroundColor = `#${trail.material.color.getHexString()}`;
      chip.append(dot, `${trail.number}회 · ${GRAVITIES[trail.config.planet].label} ${trail.config.angle}° / ${trail.config.speed} m/s`);
      legend.append(chip);
    });
    $('trail-count').textContent = `(${trails.length}/3)`;
  }

  function removeTrail(trail) {
    flightGroup.remove(trail.line);
    trail.geometry.dispose();
    trail.material.dispose();
  }

  function clearTrails() {
    if (shot && !shot.finished) {
      notify('궤적을 지우려면 먼저 초기화를 눌러 주세요.');
      return;
    }
    trails.forEach(removeTrail);
    trails = [];
    recolorTrails();
    fitCamera();
  }

  function completeShot() {
    if (!shot || shot.finished) return;
    running = false;
    shot.finished = true;
    const { solution, config } = shot;
    appendPoint(shot.trail, solution.range, 0);
    ball.position.set(solution.range, BALL_RADIUS, 0);
    displayMeasurement(solution.maxHeight, solution.range, solution.duration);
    $('measurement-status').textContent = '비행 완료';
    $('launch-button').textContent = '▶ 다시 실행';
    lockSettings(false);
    lastResult = { angle: config.angle, speed: config.speed, gravity: config.gravity, maxHeight: solution.maxHeight, range: solution.range, duration: solution.duration };
    const hit = Math.abs(solution.range - TARGET_X) <= HIT_TOLERANCE;
    if (hit) {
      win(1);
      setMessage(`🎯 과녁 명중! ${solution.range.toFixed(1)} m를 날아갔어요.`, true);
    } else {
      setMessage(`${solution.range.toFixed(1)} m를 날아갔어요. 조건을 바꾸어 비교해 보세요!`);
    }
    // 실제로 지구에서 완료한 실험과 조건이 일치할 때만 비교 미션을 달성합니다.
    if (config.planet === 'earth') {
      earthExperiments.push({ angle: config.angle, speed: config.speed, range: solution.range });
      earthExperiments = earthExperiments.slice(-30);
    }
    if (config.planet === 'moon') {
      const match = earthExperiments.find((value) => value.angle === config.angle && Math.abs(value.speed - config.speed) < 1e-8 && solution.range > value.range + 0.01);
      if (match) {
        win(2);
        setMessage(`🌙 같은 조건! 지구 ${match.range.toFixed(1)} m → 달 ${solution.range.toFixed(1)} m`, true);
      }
    }
  }

  function launch() {
    if (shot && !shot.finished) {
      running = !running;
      $('launch-button').textContent = running ? 'Ⅱ 일시정지' : '▶ 이어서 실행';
      $('measurement-status').textContent = running ? '비행 중' : '일시정지';
      setMessage(running ? '공이 그리는 곡선을 관찰해 보세요.' : '잠깐 멈췄어요. 이어서 실행할 수 있어요.');
      return;
    }
    const solution = flightSolution(settings);
    while (trails.length >= 3) removeTrail(trails.shift());
    const trail = newTrail(solution, settings);
    trails.push(trail);
    shot = { config: { ...settings }, solution, trail, elapsed: 0, maxObservedHeight: 0, finished: false };
    appendPoint(trail, 0, 0);
    running = true;
    frameStep = 0;
    ball.visible = true;
    ball.position.set(0, BALL_RADIUS, 0);
    lockSettings(true);
    recolorTrails();
    fitCamera();
    displayMeasurement();
    $('launch-button').textContent = 'Ⅱ 일시정지';
    $('measurement-status').textContent = '비행 중';
    setMessage('공이 그리는 곡선을 관찰해 보세요.');
    if (settings.angle === 45) win(0);
    // 수평 발사는 발사점과 지면이 같은 이상화 조건에서 체공 시간이 0입니다.
    if (solution.duration < 1e-9) {
      completeShot();
      setMessage('0°에서는 바로 바닥에 닿아요. 발사점과 착지점 높이가 같은 실험이에요.');
    }
  }

  function reset() {
    running = false;
    if (shot && !shot.finished) {
      removeTrail(shot.trail);
      trails = trails.filter((trail) => trail !== shot.trail);
    }
    shot = null;
    ball.visible = false;
    lastResult = null;
    displayMeasurement();
    $('launch-button').textContent = '▶ 실행';
    $('measurement-status').textContent = '발사 대기';
    lockSettings(false);
    recolorTrails();
    setMessage('현재 조건으로 다시 준비했어요. 완료된 궤적은 비교할 수 있게 남겨 두었어요.');
  }

  function pause() {
    if (running) {
      running = false;
      $('launch-button').textContent = '▶ 이어서 실행';
      $('measurement-status').textContent = '일시정지';
    }
  }

  on($('angle-slider'), 'input', (event) => { settings.angle = Number(event.target.value); updateSettingsUI(); });
  on($('speed-slider'), 'input', (event) => { settings.speed = Number(event.target.value); updateSettingsUI(); });
  for (const button of panel.querySelectorAll('[data-gravity]')) {
    on(button, 'click', () => {
      settings.planet = button.dataset.gravity;
      settings.gravity = GRAVITIES[settings.planet].g;
      updateSettingsUI();
      fitCamera();
    });
  }
  on($('launch-button'), 'click', launch);
  on($('reset-button'), 'click', reset);
  on($('clear-trails'), 'click', clearTrails);
  refreshMissions();
  updateSettingsUI();
  resizeGround(125);
  setMessage('각도와 속도를 정하고 발사해 보세요!');

  return {
    fitCamera, pause,
    update(dt) {
      if (!running || !shot || shot.finished) return;
      const previous = shot.elapsed;
      shot.elapsed = Math.min(shot.elapsed + dt, shot.solution.duration);
      const position = positionAt(shot.solution, shot.config.gravity, shot.elapsed);
      ball.position.set(position.x, position.y + BALL_RADIUS, 0);
      shot.maxObservedHeight = Math.max(shot.maxObservedHeight, position.y);
      // 정점을 고정 간격 사이에 통과해도 정확한 최고 높이를 측정합니다.
      const apexTime = shot.solution.vy / shot.config.gravity;
      if (previous <= apexTime && shot.elapsed >= apexTime) shot.maxObservedHeight = shot.solution.maxHeight;
      if (++frameStep % 2 === 0) appendPoint(shot.trail, position.x, position.y);
      uiElapsed += dt;
      if (uiElapsed >= 0.05) {
        displayMeasurement(shot.maxObservedHeight, position.x, shot.elapsed);
        uiElapsed = 0;
      }
      if (shot.elapsed >= shot.solution.duration - 1e-9) completeShot();
    },
    getContext() {
      return { settings: { ...settings, gravityUnit: 'm/s²', speedUnit: 'm/s' }, currentFlight: shot ? { time: shot.elapsed, running, finished: shot.finished } : null, lastResult };
    },
    dispose() {
      listeners.abort();
      running = false;
      root.traverse((object) => {
        object.geometry?.dispose();
        const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
        for (const material of materials) { material.map?.dispose(); material.dispose(); }
      });
      sunlight.shadow.map?.dispose();
      scene.clear();
    },
  };
}
