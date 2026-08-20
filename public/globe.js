'use strict';
(async () => {
const canvas=document.getElementById('c'),ctx=canvas.getContext('2d'),nameEl=document.getElementById('name'),statsEl=document.getElementById('stats');
let qsos=[],settings={},countries=[],rotation={x:-.2,y:-.5},zoom=1,dragging=false,last={x:0,y:0},lastTime=0;

function spherePoint(lat,lon){const a=lat*Math.PI/180,b=lon*Math.PI/180,X=Math.cos(a)*Math.sin(b),Y=Math.sin(a),Z=Math.cos(a)*Math.cos(b),cy=Math.cos(rotation.y),sy=Math.sin(rotation.y),cx=Math.cos(rotation.x),sx=Math.sin(rotation.x),X1=X*cy+Z*sy,Z1=-X*sy+Z*cy;return{x:X1,y:Y*cx-Z1*sx,z:Y*sx+Z1*cx}}
function greatCircle(a,b,t){const vector=p=>{const A=p.lat*Math.PI/180,B=p.lon*Math.PI/180;return[Math.cos(A)*Math.sin(B),Math.sin(A),Math.cos(A)*Math.cos(B)]},u=vector(a),v=vector(b),dot=Math.max(-1,Math.min(1,u[0]*v[0]+u[1]*v[1]+u[2]*v[2])),omega=Math.acos(dot),sinOmega=Math.sin(omega);let q=u;if(sinOmega>=1e-6){const a0=Math.sin((1-t)*omega)/sinOmega,a1=Math.sin(t*omega)/sinOmega;q=[u[0]*a0+v[0]*a1,u[1]*a0+v[1]*a1,u[2]*a0+v[2]*a1]}return{lat:Math.asin(q[1])*180/Math.PI,lon:Math.atan2(q[0],q[2])*180/Math.PI}}
function hue(band){return({'160M':280,'80M':260,'60M':235,'40M':210,'30M':185,'20M':160,'17M':130,'15M':95,'12M':65,'10M':35,'6M':10,'2M':330})[String(band||'').toUpperCase()]??200}
function size(){const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1),w=Math.max(1,Math.floor(rect.width*dpr)),h=Math.max(1,Math.floor(rect.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}return{w,h,dpr}}
function project(p,w,h){const radius=Math.min(w,h)*.4*zoom;return{x:w/2+p.x*radius,y:h/2-p.y*radius,z:p.z,radius}}
function drawWorld(w,h,dpr){if(!countries.length)return;ctx.fillStyle='#355f4dcc';ctx.strokeStyle='#b7d8c055';ctx.lineWidth=Math.max(.7,dpr*.55);for(const feature of countries){const polys=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;for(const poly of polys)for(const ring of poly){ctx.beginPath();let pen=false;for(const coord of ring){const p=project(spherePoint(coord[1],coord[0]),w,h);if(p.z>0){pen?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);pen=true}else pen=false}if(pen){ctx.closePath();ctx.fill();ctx.stroke()}}}}
function draw(){const{w,h,dpr}=size(),cx=w/2,cy=h/2,radius=Math.min(w,h)*.4*zoom;ctx.clearRect(0,0,w,h);const gradient=ctx.createRadialGradient(cx-radius*.25,cy-radius*.3,radius*.1,cx,cy,radius);gradient.addColorStop(0,'#2d537a');gradient.addColorStop(.55,'#12304d');gradient.addColorStop(1,'#071523');ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.fill();drawWorld(w,h,dpr);const home=settings.home;if(!home)return;ctx.lineWidth=Math.max(1,dpr*.72);for(const q of qsos){ctx.beginPath();ctx.strokeStyle=`hsla(${hue(q.band)},80%,65%,.32)`;let pen=false;for(let i=0;i<=24;i++){const point=greatCircle(home,q,i/24),p=project(spherePoint(point.lat,point.lon),w,h);if(p.z>-.02){pen?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);pen=true}else pen=false}ctx.stroke()}for(const q of qsos){const p=project(spherePoint(q.lat,q.lon),w,h);if(p.z<=0)continue;ctx.fillStyle=`hsl(${hue(q.band)},85%,68%)`;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(2*dpr,2*dpr*p.z),0,Math.PI*2);ctx.fill()}const hp=project(spherePoint(home.lat,home.lon),w,h);if(hp.z>0){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(hp.x,hp.y,4*dpr,0,Math.PI*2);ctx.fill()}}

canvas.addEventListener('pointerdown',event=>{dragging=true;last={x:event.clientX,y:event.clientY};canvas.setPointerCapture?.(event.pointerId)});
canvas.addEventListener('pointermove',event=>{if(!dragging)return;rotation.y+=(event.clientX-last.x)*.008;rotation.x=Math.max(-1.35,Math.min(1.35,rotation.x+(event.clientY-last.y)*.008));last={x:event.clientX,y:event.clientY};draw()});
canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
canvas.addEventListener('wheel',event=>{event.preventDefault();zoom=Math.max(.65,Math.min(1.5,zoom*(event.deltaY>0?.94:1.06)));draw()},{passive:false});

try{
  const [data,world]=await Promise.all([
    fetch('/api/public').then(response=>{if(!response.ok)throw new Error('Public QSO data is unavailable.');return response.json()}),
    fetch('/api/world').then(response=>{if(!response.ok)throw new Error('World map is unavailable.');return response.json()})
  ]);
  qsos=data.qsos||[];settings=data.settings||{};countries=world.features||[];
  nameEl.textContent=settings.stationName||'QSO Trails';
  statsEl.textContent=settings.showStats?`${Number(data.qsoCount||0).toLocaleString()} public QSOs`:'';
  draw();
}catch(error){statsEl.textContent=error.message||'Could not load QSO Trails.'}

const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function loop(time){if(!dragging&&settings.autoRotate&&!reduced){rotation.y+=Math.min(40,time-lastTime||16)*.00008;draw()}lastTime=time;requestAnimationFrame(loop)}
requestAnimationFrame(loop);
})();
