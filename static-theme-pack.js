'use strict';

const fs=require('fs/promises');
const path=require('path');
const crypto=require('crypto');
const express=require('express');
const topojson=require('topojson-client');
const worldAtlas=require('world-atlas/countries-50m.json');
const{renderStaticPng}=require('./static-render');
const{decodePng,encodePng}=require('./png-codec');
const{earthPng}=require('./earth-texture');

const SNAPSHOT=path.join(__dirname,'data','public-snapshot.json');
const world=topojson.feature(worldAtlas,worldAtlas.objects.countries);
const EXTRA=new Set(['midnight','aurora','amber','mono','ice','earth']);
const cache=new Map();
const W=640,H=500,GX=320,GY=170,GR=154,MX=16,MY=16,MW=608,MH=306,LIM=85.05112878;
const EARTH_FALLBACK_RETRY_MS=60_000;

function bool(v,f=true){if(v==null||v==='')return f;return!['0','false','off','no'].includes(String(v).toLowerCase())}
function opts(q){return{projection:q.projection==='mercator'?'mercator':'globe',theme:String(q.theme||'').toLowerCase(),showName:bool(q.name),showStats:bool(q.stats),showLegend:bool(q.legend),showDxcc:bool(q.dxcc),showUpdated:bool(q.updated)}}
const clamp=v=>Math.max(0,Math.min(255,Math.round(v)));

function tc(t,r,g,b){if(t==='midnight')return[clamp(r*.32),clamp(g*.5),clamp(b*.82+18)];if(t==='aurora')return[clamp(r*.48),clamp(g*.92+16),clamp(b*.8+24)];if(t==='amber')return[clamp(r*.92+28),clamp(g*.62+16),clamp(b*.27)];if(t==='mono'){const y=clamp(r*.299+g*.587+b*.114);return[y,y,y]}if(t==='ice')return[clamp(r*.64+34),clamp(g*.82+26),clamp(b*.98+28)];return[r,g,b]}
function transform(body,t){const img=decodePng(body,{maxPixels:W*H+10});for(let i=0;i<img.data.length;i+=4){const c=tc(t,img.data[i],img.data[i+1],img.data[i+2]);img.data[i]=c[0];img.data[i+1]=c[1];img.data[i+2]=c[2]}return encodePng(img.width,img.height,img.data)}

function sample(tex,lat,lon){lon=((lon+180)%360+360)%360-180;const x=Math.max(0,Math.min(tex.width-1,Math.floor((lon+180)/360*tex.width))),y=Math.max(0,Math.min(tex.height-1,Math.floor((90-lat)/180*tex.height))),i=(y*tex.width+x)*4;return[tex.data[i],tex.data[i+1],tex.data[i+2]]}
function inv(nx,ny,z2,clat,clon){const ry=-clon*Math.PI/180,cy=Math.cos(ry),sy=Math.sin(ry),rx=clat*Math.PI/180*.72,cx=Math.cos(rx),sx=Math.sin(rx),y=ny*cx+z2*sx,z1=-ny*sx+z2*cx,x=nx*cy-z1*sy,z=nx*sy+z1*cy;return{lat:Math.asin(Math.max(-1,Math.min(1,y)))*180/Math.PI,lon:Math.atan2(x,z)*180/Math.PI}}
function rot(lat,lon,clat,clon){const a=lat*Math.PI/180,b=lon*Math.PI/180,x=Math.cos(a)*Math.sin(b),y=Math.sin(a),z=Math.cos(a)*Math.cos(b),ry=-clon*Math.PI/180,cy=Math.cos(ry),sy=Math.sin(ry),x1=x*cy+z*sy,z1=-x*sy+z*cy,rx=clat*Math.PI/180*.72,cx=Math.cos(rx),sx=Math.sin(rx);return{x:x1,y:y*cx-z1*sx,z:y*sx+z1*cx}}
const gp=(lat,lon,clat,clon)=>{const q=rot(lat,lon,clat,clon);return{x:GX+q.x*GR,y:GY-q.y*GR,z:q.z}};
const mp=(lat,lon)=>{const l=Math.max(-LIM,Math.min(LIM,+lat||0))*Math.PI/180,v=Math.log(Math.tan(Math.PI/4+l/2));return{x:MX+(+lon+180)/360*MW,y:MY+(1-(v/Math.PI+1)/2)*MH,z:1}};
function gc(a,b,t){const v=p=>{const la=p.lat*Math.PI/180,lo=p.lon*Math.PI/180;return[Math.cos(la)*Math.sin(lo),Math.sin(la),Math.cos(la)*Math.cos(lo)]},u=v(a),w=v(b),d=Math.max(-1,Math.min(1,u[0]*w[0]+u[1]*w[1]+u[2]*w[2])),o=Math.acos(d),so=Math.sin(o);if(so<1e-6)return a;const s0=Math.sin((1-t)*o)/so,s1=Math.sin(t*o)/so,q=[u[0]*s0+w[0]*s1,u[1]*s0+w[1]*s1,u[2]*s0+w[2]*s1];return{lat:Math.asin(q[1])*180/Math.PI,lon:Math.atan2(q[0],q[2])*180/Math.PI}}
function hsl(h,s=.72,l=.43){h=((h%360)+360)%360/360;const f=(p,q,t)=>{if(t<0)t++;if(t>1)t--;if(t<1/6)return p+(q-p)*6*t;if(t<.5)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p},q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;return[clamp(f(p,q,h+1/3)*255),clamp(f(p,q,h)*255),clamp(f(p,q,h-1/3)*255)]}
function bandColor(b){const h=({'160M':280,'80M':260,'60M':235,'40M':210,'30M':185,'20M':160,'17M':130,'15M':95,'12M':65,'10M':35,'6M':10,'2M':330})[String(b||'').toUpperCase()]??200;return hsl(h)}
function px(p,x,y,c,a=1){x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=W||y>=H)return;const i=(y*W+x)*4;p[i]=clamp(p[i]*(1-a)+c[0]*a);p[i+1]=clamp(p[i+1]*(1-a)+c[1]*a);p[i+2]=clamp(p[i+2]*(1-a)+c[2]*a)}
function line(p,a,b,c,alpha=.58){if(!a||!b)return;const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));for(let i=0;i<=n;i++){const q=i/n;px(p,a.x+(b.x-a.x)*q,a.y+(b.y-a.y)*q,c,alpha)}}
function circle(p,x,y,r,c,a=1){for(let yy=-r-1;yy<=r+1;yy++)for(let xx=-r-1;xx<=r+1;xx++){const d=Math.hypot(xx,yy),z=Math.max(0,Math.min(1,r+.6-d));if(z)px(p,x+xx,y+yy,c,a*z)}}

function blendEarth(baseBody,tex,projection,home){const base=decodePng(baseBody,{maxPixels:W*H+10});function blend(x,y,c,a=.62){const i=(y*W+x)*4;base.data[i]=clamp(base.data[i]*(1-a)+c[0]*a);base.data[i+1]=clamp(base.data[i+1]*(1-a)+c[1]*a);base.data[i+2]=clamp(base.data[i+2]*(1-a)+c[2]*a)}if(projection==='mercator'){for(let y=MY;y<MY+MH;y++){const v=(1-2*((y-MY)/MH))*Math.PI,lat=Math.atan(Math.sinh(v))*180/Math.PI;for(let x=MX;x<MX+MW;x++)blend(x,y,sample(tex,lat,(x-MX)/MW*360-180),.7)}}else{const clat=Number(home?.lat)||0,clon=Number(home?.lon)||0;for(let y=GY-GR;y<=GY+GR;y++)for(let x=GX-GR;x<=GX+GR;x++){const nx=(x-GX)/GR,ny=(GY-y)/GR,d=nx*nx+ny*ny;if(d>1)continue;const g=inv(nx,ny,Math.sqrt(1-d),clat,clon);blend(x,y,sample(tex,g.lat,g.lon),.68)}}return base}

function redrawPaths(p,data,projection){const home=data.settings?.home;if(!home)return;const globe=projection!=='mercator',clat=Number(home.lat)||0,clon=Number(home.lon)||0,proj=globe?(lat,lon)=>gp(lat,lon,clat,clon):mp;for(const q of(data.qsos||[]).slice(0,2500)){let prev=null;for(let i=0;i<=28;i++){const g=gc(home,q,i/28),cur=proj(g.lat,g.lon);if(prev&&(!globe||prev.z>0&&cur.z>0)&&Math.abs(cur.x-prev.x)<100)line(p,prev,cur,bandColor(q.band),.58);prev=cur}const e=proj(q.lat,q.lon);if(!globe||e.z>0)circle(p,e.x,e.y,1.6,bandColor(q.band),.9)}const h=proj(home.lat,home.lon);if(!globe||h.z>0){circle(p,h.x,h.y,5,[24,41,45]);circle(p,h.x,h.y,2,[28,111,135])}}

async function image(o){const stat=await fs.stat(SNAPSHOT),key=[o.projection,o.theme,o.showName,o.showStats,o.showLegend,o.showDxcc,o.showUpdated].join(':'),old=cache.get(key),now=Date.now();if(old&&old.mtimeMs===stat.mtimeMs&&old.size===stat.size&&(!old.earthFallback||now-old.createdAt<EARTH_FALLBACK_RETRY_MS))return old;const data=JSON.parse(await fs.readFile(SNAPSHOT,'utf8')),baseTheme=o.theme==='earth'?'clean':o.theme==='amber'?'rough':o.theme==='ice'?'clean':'futuristic';let body=renderStaticPng(data,world,{...o,theme:baseTheme}),earthFallback=false;if(o.theme==='earth'){try{const tex=decodePng(await earthPng(),{maxPixels:1_000_000}),base=blendEarth(body,tex,o.projection,data.settings?.home);redrawPaths(base.data,data,o.projection);body=encodePng(W,H,base.data)}catch{earthFallback=true}}else body=transform(body,o.theme);const item={body,mtimeMs:stat.mtimeMs,size:stat.size,etag:`"${crypto.createHash('sha256').update(body).digest('base64url')}"`,earthFallback,createdAt:now};cache.set(key,item);if(cache.size>64)cache.delete(cache.keys().next().value);return item}

const originalListen=express.application.listen;
express.application.listen=function(...args){this.get('/static/qrz.png',async(req,res,next)=>{const o=opts(req.query||{});if(!EXTRA.has(o.theme))return next();try{const item=await image(o);res.set('ETag',item.etag);if(req.get('if-none-match')===item.etag)return res.status(304).end();return res.type('image/png').send(item.body)}catch(e){return next(e)}});return originalListen.apply(this,args)};

module.exports={EXTRA};
