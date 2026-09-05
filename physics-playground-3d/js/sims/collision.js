import * as THREE from 'three';

// ===== 충돌 공식: B는 정지, 바깥 힘이 없는 1차원 운동 =====
// e는 충돌 전후 상대 속도의 비율입니다. e=0이어도 운동량은 보존됩니다.
export function solveCollision({ massA, massB, speedA, restitution }) {
  const velocityA = (massA - restitution * massB) * speedA / (massA + massB);
  const velocityB = (1 + restitution) * massA * speedA / (massA + massB);
  const momentumBefore = massA * speedA;
  const momentumAfter = massA * velocityA + massB * velocityB;
  const energyBefore = 0.5 * massA * speedA ** 2;
  const energyAfter = 0.5 * massA * velocityA ** 2 + 0.5 * massB * velocityB ** 2;
  return { velocityA, velocityB, momentumBefore, momentumAfter, energyBefore, energyAfter, convertedEnergy: Math.max(0, energyBefore - energyAfter) };
}

// 충돌 시점이 고정 시간 간격 사이에 있어도 접촉 순간까지 먼저 이동한 뒤
// 남은 시간을 충돌 후 속도로 이동시켜 공이 겹치거나 운동량이 달라지지 않게 합니다.
export class CollisionMotion {
  constructor(config) {
    this.config = { ...config };
    this.result = solveCollision(config);
    this.radiusA = 1.3; // 크기는 같고 밀도(질량)만 다른 공입니다.
    this.radiusB = 1.3;
    this.xA = -12; this.xB = 2;
    this.vA = config.speedA; this.vB = 0;
    this.time = 0; this.impactTime = null; this.collided = false; this.finished = false;
  }
  step(dt) {
    if (this.finished) return false;
    let remaining = dt;
    let impact = false;
    if (!this.collided) {
      const contactIn = (this.xB - this.xA - this.radiusA - this.radiusB) / this.vA;
      if (contactIn <= dt + 1e-10) {
        const travel = Math.max(0, contactIn);
        this.xA += this.vA * travel;
        remaining -= travel;
        this.collided = true; impact = true; this.impactTime = this.time + travel;
        this.vA = this.result.velocityA; this.vB = this.result.velocityB;
      }
    }
    this.xA += this.vA * remaining;
    this.xB += this.vB * remaining;
    this.time += dt;
    if (this.collided && this.time - this.impactTime >= 3) this.finished = true;
    return impact;
  }
}

const MISSIONS = ['무거운 공 A로 가벼운 공 B를 쳐 보세요.', 'e = 0에서 두 공이 붙고 운동에너지가 줄어드는 모습을 확인하세요.', '같은 질량 · e = 1로 속도가 완전히 교환되는지 확인하세요.'];

export function createCollision({ scene, camera, controls, panel, missionFlags, award, setMessage }) {
  const config = { massA: 5, massB: 2, speedA: 5, restitution: 1 };
  let motion = new CollisionMotion(config);
  let running = false, uiTime = 0;
  const events = new AbortController();
  const $ = (id) => panel.querySelector(`#${id}`);
  const root = new THREE.Group(); scene.add(root);
  scene.background = new THREE.Color(0x172b43);
  scene.add(new THREE.HemisphereLight(0xd8eaff, 0x1c3342, 2.8));
  const light = new THREE.DirectionalLight(0xffecd8, 3); light.position.set(-8, 35, 25); scene.add(light);
  const make = (geometry, color) => new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.2 }));
  const track = make(new THREE.BoxGeometry(100, 0.6, 9), 0x314761); track.position.set(20, -0.3, 0); root.add(track);
  for (const z of [-4.4, 4.4]) {
    const rail = make(new THREE.BoxGeometry(100, 0.12, 0.1), 0x6e91ab); rail.position.set(20, 0.08, z); root.add(rail);
  }
  const grid = new THREE.GridHelper(100, 50, 0x82b7cb, 0x4d6e83); grid.position.set(20, 0.015, 0); root.add(grid);
  grid.material.transparent = true; grid.material.opacity = 0.18;
  const ballA = make(new THREE.SphereGeometry(1, 32, 20), 0xef8278);
  const ballB = make(new THREE.SphereGeometry(1, 32, 20), 0x619ff3);
  root.add(ballA, ballB);
  // 중심을 같은 높이에 두어 한 직선 위에서 접촉하게 합니다.
  const centerY = 1.3;
  function addLabel(text, color, parent) {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.font = 'bold 76px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, 64, 88);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.scale.set(2.3, 2.3, 1); sprite.position.set(0, 2, 0); parent.add(sprite);
  }
  // 라벨은 구의 회전과 분리해 항상 똑바로 읽을 수 있습니다.
  const labelA = new THREE.Group(), labelB = new THREE.Group(); root.add(labelA, labelB);
  addLabel('A', '#ffc4b8', labelA); addLabel('B', '#bad7ff', labelB);
  const impactRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 32), new THREE.MeshBasicMaterial({ color: 0xffe1a0, transparent: true, opacity: 0, side: THREE.DoubleSide }));
  root.add(impactRing);
  const bond = make(new THREE.CylinderGeometry(0.16, 0.16, 1, 12), 0xffe099); bond.rotation.z = Math.PI / 2; bond.visible = false; root.add(bond);

  panel.innerHTML = `<h2 class="panel-title">충돌 조건 <small>B는 정지 상태</small></h2>
    ${[['mass-a','A 질량',1,10,1,5,'kg'],['mass-b','B 질량',1,10,1,2,'kg'],['collision-speed','A 초기 속도',1,10,.1,5,'m/s'],['restitution','반발계수 e',0,1,.05,1,'']].map(([id,label,min,max,step,value,unit]) => `<div class="control"><div class="control-label"><label for="${id}">${label}</label><output id="${id}-value">${value}<small>${unit}</small></output></div><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><div class="range-limits"><span>${min}${id==='restitution'?' · 완전비탄성':''}</span><span>${max}${id==='restitution'?' · 완전탄성':''}</span></div></div>`).join('')}
    <div class="action-row"><button id="collision-run" class="primary-button">▶ 실행</button><button id="collision-reset" class="secondary-button">⟲ 초기화</button></div>
    <div class="measurement-heading"><h3>실시간 측정</h3><span id="collision-state">충돌 전</span></div>
    <div class="measurements"><div class="measurement"><span>A 속도</span><output id="velocity-a"></output></div><div class="measurement"><span>B 속도</span><output id="velocity-b"></output></div><div class="measurement"><span>전체 운동량</span><output id="momentum-now"></output></div><div class="measurement"><span>전체 운동에너지</span><output id="kinetic-now"></output></div></div>
    <p class="unit-note">음수 속도는 왼쪽으로 움직인다는 뜻이에요.</p>
    <hr class="section-divider"><div class="mission-heading"><h3>🎯 탐구 미션</h3><span id="collision-stars"></span></div><ol class="mission-list">${MISSIONS.map((text,index)=>`<li data-mission="${index}"><span class="mission-icon">☆</span><span>${text}</span></li>`).join('')}</ol>
    <p class="mission-tip">줄어든 운동에너지는 열·소리·변형으로 바뀌어요. 전체 에너지가 없어지는 것은 아니에요.</p>`;

  // 두 쌍의 막대는 각각 같은 눈금을 사용합니다. 회색은 변환된 운동에너지입니다.
  const graph = document.createElement('div'); graph.className = 'collision-graphs';
  graph.innerHTML = `<div class="graph-title"><b>충돌 전과 후 비교</b><span id="comparison-state">충돌 후 값은 계산 예측</span></div><div class="graph-pairs">
    <div class="graph-pair"><div class="graph-label">운동량 <small>kg·m/s</small></div><div class="bar-comparison"><div class="chart-column"><span data-p-before></span><div class="bar-well"><i class="chart-bar momentum-bar" style="height:100%"></i></div><small>충돌 전</small></div><strong class="equal-mark">=</strong><div class="chart-column"><span data-p-after></span><div class="bar-well"><i class="chart-bar momentum-bar" style="height:100%"></i></div><small>충돌 후</small></div></div></div>
    <div class="graph-pair"><div class="graph-label">운동에너지 <small>J</small></div><div class="bar-comparison"><div class="chart-column"><span data-e-before></span><div class="bar-well"><i class="chart-bar kinetic-bar" style="height:100%"></i></div><small>충돌 전</small></div><span class="energy-arrow">→</span><div class="chart-column"><span data-e-after></span><div class="bar-well converted-background"><i data-e-bar class="chart-bar kinetic-bar"></i></div><small>충돌 후</small></div></div></div></div><p class="graph-footnote">회색: 열·소리·변형으로 바뀐 에너지 <b data-loss></b></p>`;
  document.querySelector('.stage').append(graph);

  function refreshMissions(){missionFlags.forEach((done,i)=>{const li=panel.querySelector(`[data-mission="${i}"]`);li.classList.toggle('achieved',done);li.querySelector('.mission-icon').textContent=done?'★':'☆';});$('collision-stars').textContent=`${missionFlags.filter(Boolean).length} / 3`;}
  function win(i){award(i);refreshMissions();}
  function syncGraph(){const r=motion.result;for(const [key,value] of [['p-before',r.momentumBefore],['p-after',r.momentumAfter],['e-before',r.energyBefore],['e-after',r.energyAfter],['loss',r.convertedEnergy]])graph.querySelector(`[data-${key}]`).textContent=value.toFixed(1)+(key==='loss'?' J':'');graph.querySelector('[data-e-bar]').style.height=`${100*r.energyAfter/r.energyBefore}%`;graph.querySelector('#comparison-state').textContent=motion.collided?'충돌 결과 · 회색은 변환된 에너지':'충돌 후 값은 계산 예측';}
  function readouts(){for(const [id,value,unit]of[['velocity-a',motion.vA,'m/s'],['velocity-b',motion.vB,'m/s'],['momentum-now',config.massA*motion.vA+config.massB*motion.vB,'kg·m/s'],['kinetic-now',.5*config.massA*motion.vA**2+.5*config.massB*motion.vB**2,'J']])$(id).innerHTML=`${value.toFixed(2)}<small>${unit}</small>`;}
  function draw(){ballA.scale.setScalar(motion.radiusA);ballB.scale.setScalar(motion.radiusB);ballA.position.set(motion.xA,centerY,0);ballB.position.set(motion.xB,centerY,0);labelA.position.set(motion.xA,centerY,0);labelB.position.set(motion.xB,centerY,0);bond.visible=motion.collided&&config.restitution===0;bond.position.set((motion.xA+motion.xB)/2,centerY,0);bond.scale.y=motion.radiusA+motion.radiusB;}
  function lock(value){panel.querySelectorAll('input').forEach(el=>el.disabled=value);}
  function reset(){running=false;motion=new CollisionMotion(config);lock(false);$('collision-run').textContent='▶ 실행';$('collision-state').textContent='충돌 전';impactRing.material.opacity=0;draw();readouts();syncGraph();setMessage('A가 움직여 B에 부딪힙니다. 충돌 전후를 비교해 보세요.');}
  function fitCamera(){camera.position.set(8,30,60);controls.target.set(8,0,0);controls.minDistance=15;controls.maxDistance=200;controls.update();}
  for(const [id,key,unit] of [['mass-a','massA','kg'],['mass-b','massB','kg'],['collision-speed','speedA','m/s'],['restitution','restitution','']])$(id).addEventListener('input',event=>{config[key]=Number(event.target.value);$(id+'-value').innerHTML=`${config[key]}<small>${unit}</small>`;reset();},{signal:events.signal});
  $('collision-run').addEventListener('click',()=>{if(motion.finished)reset();running=!running;lock(true);$('collision-run').textContent=running?'Ⅱ 일시정지':'▶ 이어서 실행';$('collision-state').textContent=running?(motion.collided?'충돌 후':'접근 중'):'일시정지';},{signal:events.signal});
  $('collision-reset').addEventListener('click',reset,{signal:events.signal});
  refreshMissions();reset();
  return {fitCamera,pause(){if(running){running=false;$('collision-run').textContent='▶ 이어서 실행';$('collision-state').textContent='일시정지';}},
    update(dt){if(!running)return;const impact=motion.step(dt);ballA.rotation.z-=motion.vA*dt/motion.radiusA;ballB.rotation.z-=motion.vB*dt/motion.radiusB;draw();
      if(impact){if(config.massA>config.massB)win(0);if(config.restitution===0)win(1);if(config.massA===config.massB&&config.restitution===1)win(2);syncGraph();$('collision-state').textContent='충돌 후';setMessage(config.restitution===0?'두 공이 붙었어요! 운동량은 그대로, 운동에너지 일부는 열·소리로 바뀌었어요.':'충돌했어요! 아래 막대에서 전체 운동량을 비교해 보세요.',true);impactRing.position.set(motion.xA+motion.radiusA,centerY,.3);const canvas=document.getElementById('canvas-container');canvas?.classList.add('impact-shake');}
      if(motion.collided){const age=motion.time-motion.impactTime;impactRing.material.opacity=Math.max(0,1-age/.45);impactRing.scale.setScalar(1+age*9);if(age>.45)document.getElementById('canvas-container')?.classList.remove('impact-shake');}
      uiTime+=dt;if(uiTime>.05||impact){readouts();uiTime=0;}if(motion.finished){running=false;lock(false);readouts();$('collision-run').textContent='▶ 다시 실행';$('collision-state').textContent='관찰 완료';}
    },getContext(){return{settings:{...config,massUnit:'kg',speedUnit:'m/s'},current:{time:motion.time,velocityA:motion.vA,velocityB:motion.vB,collided:motion.collided},lastResult:motion.collided?motion.result:null};},
    dispose(){events.abort();graph.remove();document.getElementById('canvas-container')?.classList.remove('impact-shake');root.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});scene.clear();running=false;}
  };
}
