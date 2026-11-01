/* IMED / 21st.dev-inspired original interaction system. No third-party runtime dependencies. */
(() => {
  'use strict';
  const $ = (s, p=document) => p.querySelector(s);
  const $$ = (s, p=document) => [...p.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let motionOn = !reduced.matches;
  let visible = !document.hidden;
  const root = document.documentElement;
  const body = document.body;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

  /* accessible in-view progressive enhancement */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)} });
    },{rootMargin:'0px 0px -6% 0px',threshold:.065});
    reveals.forEach(el=>observer.observe(el));
  } else reveals.forEach(el=>el.classList.add('visible'));

  /* navigation with focus management, inert and Escape */
  const menu = $('#menu-toggle'), mobileNav = $('#mobile-nav');
  let lastFocused = null;
  function setMenu(open){
    if(!menu || !mobileNav)return;
    const wasOpen=menu.getAttribute('aria-expanded')==='true';
    if(open===wasOpen)return;
    menu.setAttribute('aria-expanded',String(open));
    menu.setAttribute('aria-label',open?'Close menu':'Open menu');
    menu.classList.toggle('active',open);
    mobileNav.classList.toggle('open',open);
    mobileNav.inert=!open;
    body.classList.toggle('menu-open',open);
    if(open){lastFocused=document.activeElement;mobileNav.querySelector('a')?.focus({preventScroll:true})}
    else if(mobileNav.contains(document.activeElement)){(lastFocused||menu)?.focus({preventScroll:true})}
  }
  menu?.addEventListener('click',()=>setMenu(menu.getAttribute('aria-expanded')!=='true'));
  $$('#mobile-nav a').forEach(a=>a.addEventListener('click',()=>setMenu(false)));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape')setMenu(false);
    if(e.key==='Tab'&&menu?.getAttribute('aria-expanded')==='true'){
      const focusables=[menu,...$$('a[href]',mobileNav)];
      const first=focusables[0],last=focusables[focusables.length-1];
      if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault()}
      else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault()}
    }
  });
  matchMedia('(min-width:901px)').addEventListener('change',e=>{if(e.matches)setMenu(false)});

  /* Doha time, no external API */
  const clock = $('#doha-time');
  const formatDoha = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Qatar',hour:'2-digit',minute:'2-digit',hour12:false});
  const updateClock=()=>{if(clock)clock.textContent=`DOHA / ${formatDoha.format(new Date())}`};
  updateClock();setInterval(updateClock,30000);

  /* progress and scroll-bound depth */
  const progress=$('#progress-bar'),topbar=$('#topbar'),hero=$('.hero'),heroVisual=$('#hero-visual');
  let scrollPending=false;
  function onScroll(){
    const y=window.scrollY, max=Math.max(1,document.documentElement.scrollHeight-innerHeight);
    if(progress)progress.style.width=`${(y/max*100).toFixed(2)}%`;
    topbar?.classList.toggle('scrolled',y>40);
    if(hero && heroVisual && motionOn && innerWidth>901 && y<innerHeight*1.5){
      heroVisual.style.setProperty('--depth-y',`${Math.round(y*.055)}px`);
      hero.style.setProperty('--grid-y',`${Math.round(y*.14)}px`);
    }
    scrollPending=false;
  }
  addEventListener('scroll',()=>{if(!scrollPending){scrollPending=true;requestAnimationFrame(onScroll)}},{passive:true});
  addEventListener('resize',onScroll,{passive:true});onScroll();

  /* 21st-style focused spotlight treatment: CSS variables never store sensitive data */
  if(finePointer.matches){
    $$('.expertise-item,.principle,.certificate-card,.hero-visual').forEach(card=>{
      card.addEventListener('pointermove',e=>{
        if(!motionOn)return;
        const rect=card.getBoundingClientRect();
        card.style.setProperty('--mx',`${(e.clientX-rect.left).toFixed(1)}px`);
        card.style.setProperty('--my',`${(e.clientY-rect.top).toFixed(1)}px`);
      },{passive:true});
    });
  }

  /* magnetic controls; never displace actual keyboard focus */
  if(finePointer.matches){
    $$('[data-magnetic]').forEach(el=>{
      el.addEventListener('pointermove',e=>{
        if(!motionOn)return;
        const r=el.getBoundingClientRect(),x=(e.clientX-r.left-r.width/2)/r.width,y=(e.clientY-r.top-r.height/2)/r.height;
        el.style.translate=`${clamp(x*15,-10,10)}px ${clamp(y*15,-10,10)}px`;
      },{passive:true});
      el.addEventListener('pointerleave',()=>{el.style.translate='0 0'});
      el.addEventListener('blur',()=>{el.style.translate='0 0'});
    });
  }

  /* optional custom desktop cursor, with a11y-safe fallback */
  const ring=$('#cursor-ring'),point=$('#cursor-point');
  let cursorX=-150,cursorY=-150,ringX=-150,ringY=-150,cursorLive=false;
  if(finePointer.matches && ring && point){
    addEventListener('pointermove',e=>{
      cursorX=e.clientX;cursorY=e.clientY;
      cursorLive=true;
      if(motionOn){ring.style.opacity='1';point.style.opacity='1'}
    },{passive:true});
    document.addEventListener('pointerout',e=>{if(!e.relatedTarget){cursorLive=false;ring.style.opacity='0';point.style.opacity='0'}});
    $$('a,button,.expertise-item').forEach(el=>{
      el.addEventListener('pointerenter',()=>ring.classList.add('hover'));
      el.addEventListener('pointerleave',()=>ring.classList.remove('hover'));
    });
  }

  /* Kinetic form: original WebGL fragment shader, with CSS fallback and performance caps.
     The volumetric sculpture is purely decorative: site works fully without WebGL. */
  const canvas=$('#sculpture');
  let gl=null,drawShader=()=>{},glReady=false,contextLost=false;
  let mx=0,my=0,tx=0,ty=0,phase=0;
  function initShader(){
    if(!canvas || !motionOn && reduced.matches)return;
    try {gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,preserveDrawingBuffer:false,powerPreference:'low-power'});}catch(e){gl=null}
    if(!gl)return;
    const vs=`attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}`;
    const fs=`precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_pointer;
    mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
    float torus(vec3 p,vec2 t){return length(vec2(length(p.xz)-t.x,p.y))-t.y;}
    float shape(vec3 p){
      p.xz*=rot(.24*sin(u_time*.32)+u_pointer.x*.17);
      p.yz*=rot(.22*sin(u_time*.21)+u_pointer.y*.17);
      vec3 a=p;a.xy*=rot(.55+u_time*.15);a.yz*=rot(1.1);
      vec3 b=p;b.xz*=rot(1.4);b.xy*=rot(-.82+u_time*.12);
      vec3 c=p;c.yz*=rot(-1.07);c.xy*=rot(.62-u_time*.09);
      float d=min(torus(a,vec2(.94,.19)),torus(b,vec2(1.02,.145)));
      d=min(d,torus(c,vec2(.90,.12)));
      return d;
    }
    vec3 normalAt(vec3 p){float e=.003;return normalize(vec3(shape(p+vec3(e,0,0))-shape(p-vec3(e,0,0)),shape(p+vec3(0,e,0))-shape(p-vec3(0,e,0)),shape(p+vec3(0,0,e))-shape(p-vec3(0,0,e))));}
    void main(){
      vec2 uv=(gl_FragCoord.xy-.5*u_resolution.xy)/min(u_resolution.x,u_resolution.y);
      uv.y-=.02;
      vec3 ro=vec3(0.,0.,3.6),rd=normalize(vec3(uv,-2.1));
      vec3 bg=mix(vec3(.035,.049,.031),vec3(.11,.143,.078),.5+.5*uv.y);
      bg+=.04*exp(-length(uv*1.2)*length(uv*1.2)*5.);
      float dist=0., t=0.;vec3 pos=vec3(0.);bool hit=false;
      for(int i=0;i<54;i++){
        pos=ro+rd*t;dist=shape(pos);
        if(dist<.0015){hit=true;break;}
        t+=max(dist*.72,.008);
        if(t>7.)break;
      }
      vec3 col=bg;
      if(hit){
        vec3 n=normalAt(pos),light=normalize(vec3(-.6,.9,1.8));
        float diff=max(dot(n,light),0.);
        vec3 halfdir=normalize(light-rd);
        float spec=pow(max(dot(n,halfdir),0.),34.);
        float rim=pow(1.-max(dot(n,-rd),0.),2.4);
        float bronze=.5+.5*sin(pos.x*5.+pos.y*2.);
        vec3 metal=mix(vec3(.18,.23,.13),vec3(.74,.86,.64),clamp(.2+diff*.9,0.,1.));
        metal=mix(metal,vec3(.82,.92,.57),bronze*.14);
        col=metal*(.35+.78*diff)+vec3(.99,1.,.75)*spec*.9+vec3(.52,.7,.33)*rim*.3;
        col*=.83+ .16*sin(pos.y*18.+pos.x*12.);
        col=mix(col,bg,1.-exp(-.014*t*t));
      }
      // freestanding optical orbit, with restrained bloom
      float rad=length(uv);
      float aura=exp(-pow((rad-.5)*4.,2.))* .048;
      col+=vec3(.32,.46,.15)*aura;
      float vign=1.-smoothstep(.35,1.35,length(uv));
      col*=.65+.35*vign;
      float noise=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
      col+=(noise-.5)*.016;
      gl_FragColor=vec4(pow(max(col,vec3(0.)),vec3(.91)),1.);
    }`;
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
    try{
      const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      const loc=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
      const uRes=gl.getUniformLocation(program,'u_resolution'),uTime=gl.getUniformLocation(program,'u_time'),uPointer=gl.getUniformLocation(program,'u_pointer');
      let w=0,h=0;
      drawShader=(seconds)=>{
        if(contextLost)return;
        const rect=canvas.getBoundingClientRect();
        const dpr=clamp(devicePixelRatio||1,1,1.4);
        const scale=(innerWidth<700?.62:.84)*dpr;
        const nw=Math.max(1,Math.round(rect.width*scale)),nh=Math.max(1,Math.round(rect.height*scale));
        if(w!==nw||h!==nh){canvas.width=w=nw;canvas.height=h=nh;gl.viewport(0,0,w,h)}
        gl.uniform2f(uRes,w,h);gl.uniform1f(uTime,seconds);gl.uniform2f(uPointer,mx,my);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      };
      glReady=true;
      canvas.style.opacity='1';
    }catch(err){console.info('Using sculptural CSS fallback',err?.message||err);glReady=false;canvas.style.display='none'}
  }
  canvas?.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;glReady=false});
  canvas?.addEventListener('webglcontextrestored',()=>{contextLost=false;glReady=false;initShader()});
  heroVisual?.addEventListener('pointermove',e=>{const r=heroVisual.getBoundingClientRect();tx=clamp((e.clientX-r.left)/r.width*2-1,-1,1);ty=clamp(1-(e.clientY-r.top)/r.height*2,-1,1)},{passive:true});
  heroVisual?.addEventListener('pointerleave',()=>{tx=ty=0},{passive:true});

  /* motion lifecycle: no animation when offscreen, hidden or user requests reduced motion */
  let visualVisible=true;
  if('IntersectionObserver' in window && heroVisual){
    new IntersectionObserver(entries=>{visualVisible=entries[0]?.isIntersecting??false},{threshold:.01}).observe(heroVisual);
  }
  let frameId=0,last=0;
  function loop(now){
    frameId=requestAnimationFrame(loop);
    if(!visible || !motionOn)return;
    // cap to ~30fps to reduce CPU/GPU load
    if(now-last<32)return;
    const delta=clamp((now-last)/1000,0,.07);last=now;
    if(cursorLive&&finePointer.matches&&ring){
      ringX+=(cursorX-ringX)*.21;ringY+=(cursorY-ringY)*.21;
      ring.style.transform=`translate3d(${(ringX-22).toFixed(1)}px,${(ringY-22).toFixed(1)}px,0)`;
      point.style.transform=`translate3d(${(cursorX-2.5).toFixed(1)}px,${(cursorY-2.5).toFixed(1)}px,0)`;
    }
    if(glReady && visualVisible){phase+=delta;mx+=(tx-mx)*.08;my+=(ty-my)*.08;drawShader(phase)}
  }
  initShader();requestAnimationFrame(loop);
  document.addEventListener('visibilitychange',()=>{visible=!document.hidden;last=performance.now()});
  reduced.addEventListener('change',e=>{motionOn=!e.matches;body.classList.toggle('motion-off',!motionOn);last=performance.now();if(!motionOn)reveals.forEach(el=>el.classList.add('visible'))});

  const toggle=$('#motion-toggle');
  function setMotion(on){
    motionOn=on;
    body.classList.toggle('motion-off',!on);
    toggle?.setAttribute('aria-pressed',String(!on));
    if(toggle)toggle.innerHTML=`MOTION <span>${on?'ON':'OFF'}</span>`;
    if(!on){reveals.forEach(el=>el.classList.add('visible'));ring&&(ring.style.opacity='0');point&&(point.style.opacity='0')}
    else if(!glReady&&!gl&&canvas)initShader();
    last=performance.now();
  }
  setMotion(motionOn);
  toggle?.addEventListener('click',()=>setMotion(!motionOn));

  // Expose only a non-sensitive test hook for smoke tests.
  Object.defineProperty(window,'__portfolioHealth',{get:()=>({webgl:glReady,motion:motionOn,menuOpen:menu?.getAttribute('aria-expanded')==='true'})});
})();