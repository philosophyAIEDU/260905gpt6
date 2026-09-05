import * as THREE from 'three';
// 교육용 단위: G=1 m³/(kg·s²), 행성 질량=1kg. 항성의 반작용은 생략합니다.
export const ORBIT_G=1;
export class OrbitMotion {
  constructor({distance=40,speed=5,mass=1000}={}){this.mass=mass;this.mu=ORBIT_G*mass;this.x=distance;this.z=0;this.vx=0;this.vz=speed;this.time=0;this.angle=0;this.lastLapTime=0;this.period=null;this.laps=0;this.hit=false;this.initialDistance=distance;}
  get radius(){return Math.hypot(this.x,this.z);}
  get speed(){return Math.hypot(this.vx,this.vz);}
  get specificEnergy(){return this.speed**2/2-this.mu/this.radius;}
  get eccentricity(){const h=this.x*this.vz-this.z*this.vx;return Math.sqrt(Math.max(0,1+2*this.specificEnergy*h*h/(this.mu*this.mu)));}
  get kind(){return this.specificEnergy>=-1e-6?'탈출!':this.eccentricity<.08?'원 궤도':'타원 궤도';}
  // 속도 베르레: 위치를 반 스텝 가속도로 이동한 뒤, 두 위치의 가속도를 평균합니다.
  step(dt){if(this.hit)return;const r=this.radius,oldAngle=Math.atan2(this.z,this.x);const factor=-this.mu/r**3,ax=factor*this.x,az=factor*this.z;
    const nx=this.x+this.vx*dt+.5*ax*dt*dt,nz=this.z+this.vz*dt+.5*az*dt*dt;
    const nr=Math.hypot(nx,nz);if(nr<=4){this.hit=true;return;}
    const factor2=-this.mu/nr**3;this.vx+=.5*(ax+factor2*nx)*dt;this.vz+=.5*(az+factor2*nz)*dt;this.x=nx;this.z=nz;this.time+=dt;
    let d=Math.atan2(nz,nx)-oldAngle;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
    const before=this.angle;this.angle+=d;
    if(Math.floor(this.angle/(2*Math.PI))>Math.floor(before/(2*Math.PI))){const lap=Math.floor(this.angle/(2*Math.PI)),fraction=(lap*2*Math.PI-before)/(d||1);const when=this.time-dt+fraction*dt;this.period=when-this.lastLapTime;this.lastLapTime=when;this.laps=lap;}
  }
}
export function createOrbit({scene,camera,controls,panel,missionFlags,award,setMessage}){
  const config={distance:40,speed:5,mass:1000};let model=new OrbitMotion(config),running=false,steps=0,uiTime=0;
  const events=new AbortController(),root=new THREE.Group();scene.add(root);scene.background=new THREE.Color(0x080f24);
  scene.add(new THREE.AmbientLight(0xa4bfff,1.8));const light=new THREE.PointLight(0xffdc99,1100,500,1);scene.add(light);
  const star=new THREE.Mesh(new THREE.SphereGeometry(4,32,24),new THREE.MeshBasicMaterial({color:0xffd57b}));root.add(star);
  const glow=new THREE.Mesh(new THREE.SphereGeometry(5.5,24,16),new THREE.MeshBasicMaterial({color:0xffc86e,transparent:true,opacity:.09,depthWrite:false}));root.add(glow);
  const planet=new THREE.Mesh(new THREE.SphereGeometry(1.35,24,16),new THREE.MeshStandardMaterial({color:0x7ddbcc,emissive:0x1a524f,roughness:.45}));root.add(planet);
  const stars=new Float32Array(1500*3);let seed=42;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<stars.length;i++)stars[i]=(random()-.5)*2400;
  const starsGeometry=new THREE.BufferGeometry();starsGeometry.setAttribute('position',new THREE.BufferAttribute(stars,3));root.add(new THREE.Points(starsGeometry,new THREE.PointsMaterial({color:0xd0dafa,size:1.5,sizeAttenuation:true})));
  const trailGeometry=new THREE.BufferGeometry(),positions=new Float32Array(2000*3);trailGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));trailGeometry.setDrawRange(0,0);const line=new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:0x9aeee0,transparent:true,opacity:.8}));line.frustumCulled=false;root.add(line);let points=[];
  const $=id=>panel.querySelector('#'+id);
  panel.innerHTML=`<h2 class="panel-title">궤도 조건 <small>행성 질량 1 kg</small></h2>${[['orbit-distance','시작 거리',15,80,1,40,'m'],['orbit-speed','초기 속도',.5,16,.1,5,'m/s'],['star-mass','항성 질량',500,3000,50,1000,'kg']].map(([id,label,min,max,step,value,unit])=>`<div class="control"><div class="control-label"><label for="${id}">${label}</label><output id="${id}-value">${value}<small>${unit}</small></output></div><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><div class="range-limits"><span>${min}</span><span>${max}</span></div></div>`).join('')}<p class="unit-note">처음에는 항성과 연결한 선에 수직으로 발사합니다.</p><div class="action-row"><button id="orbit-run" class="primary-button">▶ 실행</button><button id="orbit-reset" class="secondary-button">⟲ 초기화</button></div><div class="orbit-classification" id="orbit-kind">원 궤도</div><div class="measurements"><div class="measurement"><span>현재 속도</span><output id="orbit-v"></output></div><div class="measurement"><span>항성까지 거리</span><output id="orbit-r"></output></div><div class="measurement"><span>공전 주기</span><output id="orbit-period">관찰 중<small>s</small></output></div></div><p class="unit-note" id="orbit-reference"></p><hr class="section-divider"><div class="mission-heading"><h3>🎯 탐구 미션</h3><span id="orbit-stars"></span></div><ol class="mission-list">${['원에 가까운 궤도를 만들어 보세요.','길쭉한 타원 궤도를 만들어 보세요.','속도를 높여 항성의 중력에서 탈출시켜 보세요.'].map((t,i)=>`<li data-mission="${i}"><span class="mission-icon">☆</span><span>${t}</span></li>`).join('')}</ol><p class="mission-tip">거리와 질량은 교육용으로 줄인 값이에요. 한 바퀴를 돌면 실제로 측정한 공전 주기가 표시됩니다.</p>`;
  function refresh(){missionFlags.forEach((v,i)=>{const li=panel.querySelector(`[data-mission="${i}"]`);li.classList.toggle('achieved',v);li.querySelector('.mission-icon').textContent=v?'★':'☆';});$('orbit-stars').textContent=`${missionFlags.filter(Boolean).length} / 3`;}
  function win(i){if(missionFlags[i])return;award(i);refresh();}
  function readouts(){$('orbit-v').innerHTML=`${model.speed.toFixed(2)}<small>m/s</small>`;$('orbit-r').innerHTML=`${model.radius.toFixed(1)}<small>m</small>`;$('orbit-period').innerHTML=model.period?`${model.period.toFixed(2)}<small>s</small>`:`${model.kind==='탈출!'?'주기 없음':'관찰 중'}<small>s</small>`;$('orbit-kind').textContent=model.hit?'항성과 충돌':model.kind;$('orbit-reference').textContent=`이 조건의 원 궤도 속도: ${Math.sqrt(model.mu/config.distance).toFixed(2)} m/s`;}
  function draw(){planet.position.set(model.x,0,model.z);}
  function fitCamera(){const radius=Math.max(config.distance,Math.min(model.radius,600));const d=Math.max(100,radius*2.8/Math.min(1,camera.aspect));camera.position.set(0,d*.9,d*.6);controls.target.set(0,0,0);controls.minDistance=20;controls.maxDistance=6000;controls.maxPolarAngle=Math.PI-.05;controls.update();}
  function lock(value){panel.querySelectorAll('input').forEach(el=>el.disabled=value);}
  function reset(){running=false;model=new OrbitMotion(config);points=[];trailGeometry.setDrawRange(0,0);steps=0;lock(false);$('orbit-run').textContent='▶ 실행';draw();readouts();fitCamera();setMessage('초기 속도를 바꾸면 궤도가 어떻게 달라질까요?');}
  for(const[id,key,unit]of[['orbit-distance','distance','m'],['orbit-speed','speed','m/s'],['star-mass','mass','kg']])$(id).addEventListener('input',event=>{config[key]=Number(event.target.value);$(id+'-value').innerHTML=`${config[key]}<small>${unit}</small>`;reset();},{signal:events.signal});
  $('orbit-run').addEventListener('click',()=>{if(model.hit)reset();running=!running;lock(true);$('orbit-run').textContent=running?'Ⅱ 일시정지':'▶ 이어서 실행';},{signal:events.signal});$('orbit-reset').addEventListener('click',reset,{signal:events.signal});refresh();reset();
  return{fitCamera,pause(){running=false;$('orbit-run').textContent='▶ 이어서 실행';},update(dt){if(!running)return;model.step(dt);draw();if(++steps%12===0){points.push([model.x,0,model.z]);if(points.length>2000)points.shift();for(let i=0;i<points.length;i++)positions.set(points[i],i*3);trailGeometry.attributes.position.needsUpdate=true;trailGeometry.setDrawRange(0,points.length);}
    if(model.time>2&&!model.hit){if(model.kind==='원 궤도'&&model.angle>Math.PI/4)win(0);if(model.kind==='타원 궤도'&&model.eccentricity>.5&&model.angle>Math.PI/4)win(1);if(model.kind==='탈출!'&&model.radius>config.distance*1.2)win(2);}
    uiTime+=dt;if(uiTime>.1){readouts();uiTime=0;}if(model.hit){running=false;lock(false);$('orbit-run').textContent='▶ 다시 실행';readouts();setMessage('항성과 부딪혔어요. 초기 속도를 높여 다시 도전해 보세요.');}if(model.radius>1500){running=false;lock(false);$('orbit-run').textContent='▶ 이어서 실행';setMessage('멀리 탈출했어요! 초기화하여 다른 조건을 비교해 보세요.',true);}
  },getContext(){return{settings:{...config,G:ORBIT_G},current:{speed:model.speed,distance:model.radius,period:model.period,laps:model.laps,kind:model.kind,eccentricity:model.eccentricity},units:{distance:'m',speed:'m/s',mass:'kg',period:'s'}};},dispose(){events.abort();root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});scene.clear();running=false;}};
}
