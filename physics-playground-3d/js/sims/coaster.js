import * as THREE from 'three';

const G = 9.8;
export const FRICTION = { none: 0, light: 0.04, heavy: 0.2 };

// ===== 트랙: 출발 언덕 + 두 번째 언덕 + 한 개의 루프 =====
// 살짝 옆으로 이동하는 루프를 사용해 입구와 출구의 레일이 겹치지 않게 합니다.
export function createTrack(height) {
  const points = [[-30,height,0],[-27,height-2,0],[-22,Math.max(2.8,height*.42),0],[-16,2,0],[-11,3.5,0],[-7,6.5,0],[-3,3.5,0],[2,2,0],[7,2,0],[10,2,0]].map(p=>new THREE.Vector3(...p));
  const loopStartIndex = points.length - 1;
  for(let i=1;i<=32;i++){const a=-Math.PI/2+2*Math.PI*i/32;points.push(new THREE.Vector3(10+4.5*Math.cos(a),6.5+4.5*Math.sin(a),2*i/32));}
  const loopEndIndex = points.length - 1;
  points.push(new THREE.Vector3(16,2,2),new THREE.Vector3(23,2.8,2),new THREE.Vector3(31,2.8,2));
  const curve = new THREE.CatmullRomCurve3(points,false,'centripetal');
  curve.arcLengthDivisions = 4000;
  const lengths = curve.getLengths(4000);
  const distanceAtIndex = index => {
    const scaled=index/(points.length-1)*4000, low=Math.floor(scaled), fraction=scaled-low;
    return lengths[low]+((lengths[low+1]??lengths[low])-lengths[low])*fraction;
  };
  return { curve, length:curve.getLength(), loopStart:distanceAtIndex(loopStartIndex), loopEnd:distanceAtIndex(loopEndIndex) };
}

// ===== 에너지 보존을 직접 적용하는 레일 위 질점 모형 =====
// U=mgh, K=½mv², 열=마찰력×총 이동 거리. 회전 운동과 레일 이탈은 생략합니다.
// 마찰이 없으면 v=√(2g(h₀-h)). 마찰이 있으면 열만큼 뺀 에너지로 속도를 구합니다.
export class CoasterMotion {
  constructor(height,friction='none') {
    this.track=createTrack(height);this.initialHeight=height;this.friction=friction;
    this.mass=1;this.total=G*height;this.heat=0;this.s=0;this.v=0;this.time=0;
    this.finished=false;this.passedLoop=false;this.turns=0;this.lastTurn=null;
  }
  point(s=this.s){return this.track.curve.getPointAt(Math.max(0,Math.min(1,s/this.track.length)));}
  energy(s=this.s,heat=this.heat){const potential=this.mass*G*this.point(s).y;return{potential,kinetic:Math.max(0,this.total-heat-potential),heat,total:this.total};}
  slope(s=this.s){const a=Math.max(0,s-.03),b=Math.min(this.track.length,s+.03);return(this.point(b).y-this.point(a).y)/(b-a||1);}
  step(dt) {
    if(this.finished)return;
    const oldS=this.s,oldHeat=this.heat,oldVelocity=this.v;
    const slope=this.slope();const mu=FRICTION[this.friction];
    // 정지한 순간에는 내리막 방향을 선택합니다. 마찰보다 작은 경사에서는 멈춥니다.
    const direction=Math.abs(this.v)>1e-8?Math.sign(this.v):-Math.sign(slope);
    let acceleration=-G*slope-mu*G*direction;
    if(Math.abs(this.v)<1e-8&&Math.abs(slope)<=mu)acceleration=0;
    const halfVelocity=this.v+.5*acceleration*dt;
    let next=Math.max(0,Math.min(this.track.length,oldS+halfVelocity*dt));
    const available=s=>this.total-oldHeat-mu*G*Math.abs(s-oldS)-G*this.point(s).y;
    if(available(next)<-1e-10){
      // 도달할 수 없는 높이까지 올라가지 않도록 v=0인 전환점을 이분 탐색합니다.
      let low=0,high=1;
      for(let i=0;i<40;i++){const mid=(low+high)/2;if(available(oldS+(next-oldS)*mid)>=0)low=mid;else high=mid;}
      next=oldS+(next-oldS)*low;
      this.v=0;this.turns++;this.lastTurn=next;
    }else {
      this.v=Math.sign(halfVelocity)*Math.sqrt(Math.max(0,2*available(next)/this.mass));
      // 전환점이 시간 간격 안에 있으면 에너지가 음수가 되기 전에 방향이 바뀔 수도 있습니다.
      if(oldVelocity*this.v<0){this.turns++;this.lastTurn=oldS;}
    }
    this.s=next;this.heat=oldHeat+mu*G*Math.abs(next-oldS);this.time+=dt;
    if(oldS<this.track.loopEnd&&next>=this.track.loopEnd)this.passedLoop=true;
    if(next>=this.track.length-1e-8)this.finished=true;
    if(this.time>1&&Math.abs(next-oldS)<1e-12&&Math.abs(this.v)<1e-8&&Math.abs(slope)<=mu)this.finished=true;
  }
  // 위치에너지와 운동에너지가 같아지는 지점에서 정확히 멈춥니다.
  stopAtBalance(oldS,oldHeat) {
    const end=this.s,sign=Math.sign(this.v)||1,mu=FRICTION[this.friction];
    const diff=s=>2*G*this.point(s).y+oldHeat+mu*G*Math.abs(s-oldS)-this.total;
    if(diff(oldS)*diff(end)>0||Math.abs(end-oldS)<1e-10)return false;
    let low=0,high=1;const initialSign=Math.sign(diff(oldS));
    for(let i=0;i<40;i++){const t=(low+high)/2;if(Math.sign(diff(oldS+(end-oldS)*t))===initialSign)low=t;else high=t;}
    this.s=oldS+(end-oldS)*(low+high)/2;this.heat=oldHeat+mu*G*Math.abs(this.s-oldS);
    this.v=sign*Math.sqrt(2*this.energy().kinetic/this.mass);this.finished=false;
    return true;
  }
}

const MISSIONS=['구슬을 루프 끝까지 통과시켜 보세요.','마찰이 많아도 루프를 통과할 수 있는 출발 높이를 찾아보세요.','위치에너지와 운동에너지가 정확히 같아지는 지점을 찾아보세요.'];
export function createCoaster({scene,camera,controls,panel,missionFlags,award,setMessage}) {
  const settings={height:18,friction:'none'};
  let model=new CoasterMotion(settings.height,settings.friction),running=false,started=false,uiTime=0;
  const events=new AbortController();const $=id=>panel.querySelector('#'+id);
  const root=new THREE.Group();scene.add(root);let trackGroup=new THREE.Group();root.add(trackGroup);
  scene.background=new THREE.Color(0x213445);scene.add(new THREE.HemisphereLight(0xe0efff,0x2b4546,2.8));
  const light=new THREE.DirectionalLight(0xffdfb3,3);light.position.set(-20,50,30);scene.add(light);
  const make=(geo,color)=>new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,roughness:.5,metalness:.22}));
  const ground=make(new THREE.PlaneGeometry(160,110),0x254940);ground.rotation.x=-Math.PI/2;ground.position.y=-.1;root.add(ground);
  const grid=new THREE.GridHelper(160,16,0x5c8c7e,0x3d695d);grid.material.transparent=true;grid.material.opacity=.2;root.add(grid);
  const ball=make(new THREE.SphereGeometry(.85,24,18),0xffdf87);root.add(ball);
  const marker=make(new THREE.TorusGeometry(1.2,.07,8,40),0xffe099);marker.rotation.y=Math.PI/2;root.add(marker);
  function disposeGroup(group){group.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});}
  function rebuildTrack(){
    disposeGroup(trackGroup);root.remove(trackGroup);trackGroup=new THREE.Group();root.add(trackGroup);
    const rail=make(new THREE.TubeGeometry(model.track.curve,650,.24,8,false),0x85ded0);trackGroup.add(rail);
    // 일정한 거리마다 받침대를 둡니다. 구슬이 움직이는 중심선은 위의 곡선입니다.
    const length=model.track.length;
    for(let s=0;s<length;s+=6){const p=model.point(s);if(s>model.track.loopStart&&s<model.track.loopEnd)continue;const post=make(new THREE.CylinderGeometry(.13,.18,p.y,7),0x4e7f81);post.position.set(p.x,p.y/2,p.z);trackGroup.add(post);}
    const gate=make(new THREE.TorusGeometry(1.3,.1,8,32),0xf2bc79);gate.position.copy(model.point(model.track.loopEnd));gate.rotation.y=Math.PI/2;trackGroup.add(gate);
    draw();
  }
  panel.innerHTML=`<h2 class="panel-title">출발 조건 <small>구슬 질량 1 kg</small></h2><div class="control"><div class="control-label"><label for="coaster-height">출발 높이</label><output id="coaster-height-value">18<small>m</small></output></div><input id="coaster-height" type="range" min="5" max="30" step=".5" value="18"><div class="range-limits"><span>5 m</span><span>30 m</span></div></div><div class="control"><div class="control-label"><span id="friction-label">마찰</span></div><div class="segmented" role="group" aria-labelledby="friction-label"><button data-friction="none" aria-pressed="true">없음</button><button data-friction="light" aria-pressed="false">약간</button><button data-friction="heavy" aria-pressed="false">많이</button></div></div>
    <div class="action-row"><button id="coaster-run" class="primary-button">▶ 실행</button><button id="coaster-reset" class="secondary-button">⟲ 초기화</button></div><div class="measurement-heading"><h3>실시간 측정</h3><span id="coaster-state">출발 대기</span></div><div class="measurements"><div class="measurement"><span>현재 높이</span><output id="coaster-h"></output></div><div class="measurement"><span>현재 속력</span><output id="coaster-v"></output></div><div class="measurement"><span>총 에너지</span><output id="coaster-total"></output></div><div class="measurement"><span>열로 바뀐 에너지</span><output id="coaster-heat"></output></div></div>
    <hr class="section-divider"><div class="mission-heading"><h3>🎯 탐구 미션</h3><span id="coaster-stars"></span></div><ol class="mission-list">${MISSIONS.map((text,i)=>`<li data-mission="${i}"><span class="mission-icon">☆</span><span>${text}</span></li>`).join('')}</ol><p class="mission-tip">두 에너지가 처음 같아지면 잠깐 멈춰요. ‘이어서 실행’을 누르면 실험이 계속됩니다.</p><p class="unit-note">구슬이 레일에 고정되어 움직이는 모형입니다. 회전 에너지와 레일 이탈은 생략합니다.</p>`;
  const chart=document.createElement('div');chart.className='coaster-chart';
  chart.innerHTML=`<div class="energy-total-line"><span>총 에너지</span><b data-total></b></div><div class="energy-sum-label">위치 + 운동 + 열 = 일정</div><div class="energy-columns">${[['potential','위치','#65a9fa'],['kinetic','운동','#f18480'],['heat','열','#a3adbc']].map(([id,label,color])=>`<div class="energy-column"><strong data-number="${id}"></strong><div class="energy-well"><i data-energy="${id}" style="background:${color}"></i></div><span>${label}</span></div>`).join('')}</div><div class="energy-stacked" aria-label="전체 에너지 구성"><i data-sum="potential"></i><i data-sum="kinetic"></i><i data-sum="heat"></i></div><p>막대의 값과 합의 단위: J</p>`;
  document.querySelector('.stage').append(chart);
  function refreshMissions(){missionFlags.forEach((done,i)=>{const li=panel.querySelector(`[data-mission="${i}"]`);li.classList.toggle('achieved',done);li.querySelector('.mission-icon').textContent=done?'★':'☆';});$('coaster-stars').textContent=`${missionFlags.filter(Boolean).length} / 3`;}
  function win(i){award(i);refreshMissions();}
  function readouts(){const e=model.energy();for(const[id,value,unit]of[['coaster-h',model.point().y,'m'],['coaster-v',Math.abs(model.v),'m/s'],['coaster-total',e.total,'J'],['coaster-heat',e.heat,'J']])$(id).innerHTML=`${value.toFixed(2)}<small>${unit}</small>`;chart.querySelector('[data-total]').textContent=`${e.total.toFixed(1)} J`;for(const id of ['potential','kinetic','heat']){const ratio=Math.max(0,Math.min(100,100*e[id]/e.total));chart.querySelector(`[data-energy="${id}"]`).style.height=ratio+'%';chart.querySelector(`[data-sum="${id}"]`).style.width=ratio+'%';chart.querySelector(`[data-number="${id}"]`).textContent=e[id].toFixed(1);}}
  function draw(){ball.position.copy(model.point());ball.position.y+=1.05;marker.position.copy(ball.position);marker.visible=!running;}
  function lock(value){$('coaster-height').disabled=value;panel.querySelectorAll('[data-friction]').forEach(button=>button.disabled=value);}
  function reset(){running=false;started=false;model=new CoasterMotion(settings.height,settings.friction);rebuildTrack();lock(false);$('coaster-run').textContent='▶ 실행';$('coaster-state').textContent='출발 대기';readouts();setMessage('높이를 정하고 구슬을 놓아 보세요. 에너지가 어떻게 바뀔까요?');}
  function fitCamera(){const aspect=Math.max(.6,camera.aspect),distance=Math.max(80,68/aspect);camera.position.set(10,distance*.55,distance);controls.target.set(2,9,0);controls.minDistance=20;controls.maxDistance=250;controls.update();}
  $('coaster-height').addEventListener('input',event=>{settings.height=Number(event.target.value);$('coaster-height-value').innerHTML=`${settings.height}<small>m</small>`;reset();},{signal:events.signal});
  panel.querySelectorAll('[data-friction]').forEach(button=>button.addEventListener('click',()=>{settings.friction=button.dataset.friction;panel.querySelectorAll('[data-friction]').forEach(b=>b.setAttribute('aria-pressed',b===button));reset();},{signal:events.signal}));
  $('coaster-run').addEventListener('click',()=>{if(model.finished)reset();running=!running;started=true;lock(true);$('coaster-run').textContent=running?'Ⅱ 일시정지':'▶ 이어서 실행';$('coaster-state').textContent=running?'관찰 중':'일시정지';draw();},{signal:events.signal});
  $('coaster-reset').addEventListener('click',reset,{signal:events.signal});
  refreshMissions();reset();
  return{fitCamera,pause(){if(running){running=false;$('coaster-run').textContent='▶ 이어서 실행';$('coaster-state').textContent='일시정지';}},
    update(dt){if(!running)return;const oldS=model.s,oldHeat=model.heat,oldTurns=model.turns;model.step(dt);
      if(!missionFlags[2]&&model.stopAtBalance(oldS,oldHeat)){win(2);running=false;$('coaster-run').textContent='▶ 이어서 실행';$('coaster-state').textContent='위치 = 운동';setMessage(`두 에너지가 각각 ${model.energy().potential.toFixed(2)} J로 같아요! 이어서 실행해 보세요.`,true);}
      if(model.turns>oldTurns){setMessage(model.lastTurn>=model.track.loopStart&&model.lastTurn<=model.track.loopEnd?'속도가 부족해서 못 넘었어요! 구슬이 다시 내려옵니다.':'다음 언덕을 넘기에는 에너지가 부족해요. 구슬이 되돌아옵니다.');}
      if(model.passedLoop&&!missionFlags[0]){win(0);setMessage('🎢 루프를 통과했어요! 남은 에너지를 관찰해 보세요.',true);}
      if(model.passedLoop&&settings.friction==='heavy'&&!missionFlags[1]){win(1);setMessage(`마찰이 많아도 ${settings.height} m에서 루프를 통과했어요!`,true);}
      ball.rotation.z-=model.v*dt/.85;draw();uiTime+=dt;if(uiTime>.05||!running){readouts();uiTime=0;}
      if(model.finished){running=false;lock(false);readouts();$('coaster-run').textContent='▶ 다시 실행';$('coaster-state').textContent=model.s>=model.track.length-1e-8?'도착 순간':'정지';setMessage(model.s>=model.track.length-1e-8?'도착했어요! 위치·운동·열 에너지의 합은 처음과 같아요.':'마찰 때문에 구슬이 멈췄어요. 줄어든 운동에너지는 열로 바뀌었어요.');}
    },getContext(){return{settings:{...settings,mass:1,massUnit:'kg',heightUnit:'m'},current:{height:model.point().y,speed:Math.abs(model.v),...model.energy(),passedLoop:model.passedLoop},model:'회전·레일 이탈을 생략한 레일 위 질점'};},
    dispose(){events.abort();chart.remove();disposeGroup(root);scene.clear();running=false;}
  };
}
