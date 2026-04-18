/* ── CONSTANTS ── */
const STORAGE_KEY='mathtype.scores.v1';
const STREAK_CAP=20;
const TICK_MS=100;
const BOOST_DIVISOR=5;
const TOP_SCORES=3;
const SHAKE_MS=300;
const CORRECT_BONUS=1;
const ERROR_PENALTY=2;

const GAME_LABELS={calcul:'calcul mental',algebra:'algèbre',matrices:'matrices'};
const START_MSGS={
  calcul:'calcul mental rapide<br>tape ta réponse + <span class="kbd">entrée</span>',
  algebra:'résous pour x le plus vite possible<br>tape la valeur de x + <span class="kbd">entrée</span>',
  matrices:'opérations matricielles<br>tape ta réponse + <span class="kbd">entrée</span>'
};
const MODE_PANELS={calcul:'calculModes',algebra:'algebraModes',matrices:'matrixModes'};

/* ── STATE ── */
const S={
  game:'calcul',
  mode:'addition',algMode:'linear',matMode:'det2',
  time:60,diff:'easy',
  running:false,interval:null,startTime:0,
  correctCount:0,errorCount:0,
  currentStreak:0,bestStreak:0,
  answer:0,history:[],adaptiveDiff:1,
  lastStats:{cpm:-1,correct:-1,errors:-1,streak:-1}
};

/* ── DOM CACHE ── */
const E=Object.fromEntries(
  ['answer','problem','problemSub','inputPrefix','timerFill',
   'startScreen','gameScreen','resultScreen','startMsg','startBtn','retryBtn',
   'streakDots','diffIndicator',
   'cpm','correct','errors','streak',
   'rCpm','rAcc','rCorrect','rStreak',
   'gameTabs','modeBar','calculModes','algebraModes','matrixModes',
   'scorePanelGame','scorePanelMeta','bestChips','lastChip']
    .map(id=>[id,document.getElementById(id)])
);

/* ── HELPERS ── */
function rnd(a,b){return Math.floor(Math.random()*(b-a+1))+a}
function boost(cap=3){return Math.min(Math.floor(S.adaptiveDiff/BOOST_DIVISOR),cap)}
function setActive(selector,btn){
  document.querySelectorAll(selector).forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
function showScreen(id){
  for(const s of ['startScreen','gameScreen','resultScreen']){
    E[s].style.display=(s===id?'block':'none');
  }
}

/* ── SCORE STORAGE ── */
let scoreCache=null;
function loadScores(){
  if(scoreCache) return scoreCache;
  try{scoreCache=JSON.parse(localStorage.getItem(STORAGE_KEY))||{};}
  catch(e){scoreCache={}}
  return scoreCache;
}
function saveScores(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(scoreCache));}catch(e){}
}
function scoreKey(){return `${S.game}.${S.time}s`}
function recordScore(cpm,acc){
  const data=loadScores();
  const entry=data[scoreKey()]||{best:[],last:null};
  const score={cpm,acc,ts:Date.now(),diff:S.diff};
  entry.last=score;
  entry.best.push(score);
  entry.best.sort((a,b)=>b.cpm-a.cpm);
  entry.best=entry.best.slice(0,TOP_SCORES);
  data[scoreKey()]=entry;
  saveScores();
  renderScorePanel(true);
}
function makeChip(score,extraClass){
  const chip=document.createElement('div');
  if(score){
    chip.className='score-chip'+(extraClass?' '+extraClass:'');
    const cpm=document.createElement('span');
    cpm.className='chip-cpm';cpm.textContent=score.cpm;
    const diff=document.createElement('span');
    diff.className='chip-diff '+score.diff;diff.textContent=score.diff;
    chip.append(cpm,diff);
    chip.title=`${score.cpm} cpm · ${score.acc}% · ${score.diff}`;
  }else{
    chip.className='score-chip empty';
    chip.textContent='—';
  }
  return chip;
}
function renderScorePanel(highlightLast){
  const entry=loadScores()[scoreKey()]||{best:[],last:null};
  E.scorePanelGame.textContent=GAME_LABELS[S.game];
  E.scorePanelMeta.textContent=`${S.time}s`;
  E.bestChips.replaceChildren(...Array.from({length:TOP_SCORES},(_,i)=>makeChip(entry.best[i],'best')));
  E.lastChip.replaceChildren(makeChip(entry.last,highlightLast?'last-new':''));
}

/* ── CALCUL MENTAL ── */
const CALC_RANGES={
  easy:{add:[2,20],mul:[2,9]},
  medium:{add:[10,99],mul:[3,15]},
  hard:{add:[50,999],mul:[5,30]}
};

function genCalcul(){
  let m=S.mode;
  if(m==='mixed') m=['addition','subtraction','multiplication'][rnd(0,2)];
  const r=CALC_RANGES[S.diff];
  let a,b,op,ans;
  if(m==='addition'||m==='subtraction'){
    const mx=Math.min(r.add[1]+boost()*10,999);
    a=rnd(r.add[0],mx);b=rnd(r.add[0],mx);
    if(m==='subtraction'&&a<b)[a,b]=[b,a];
    op=m==='addition'?'+':'−';
    ans=m==='addition'?a+b:a-b;
  }else{
    const mx=Math.min(r.mul[1]+boost()*2,30);
    a=rnd(r.mul[0],mx);b=rnd(r.mul[0],mx);
    op='×';ans=a*b;
  }
  S.answer=ans;
  return {display:`${a} ${op} ${b}`,sub:''};
}

/* ── ALGÈBRE ──
   Table-driven: base range + per-term boost multiplier (aB/xB/bB).
   bSign: probability of negating b (optional). */
const ALG_CONFIGS={
  linear:{
    easy:{a:[1,1],x:[1,10],xB:3,b:[1,10],bB:2,bSign:0.3},
    medium:{a:[2,5],aB:1,x:[1,12],xB:2,b:[1,15],bB:3,bSign:0.4},
    hard:{a:[2,9],aB:1,x:[-10,15],xB:2,b:[-20,20],bB:3}
  },
  twostep:{
    easy:{a:[2,4],aB:1,x:[1,8],xB:2,b:[1,12],bB:2,bSign:0.35},
    medium:{a:[2,7],aB:1,x:[-8,12],xB:2,b:[-20,20],bB:3},
    hard:{a:[3,12],aB:1,x:[-15,15],xB:2,b:[-30,30],bB:3}
  },
  bothsides:{
    easy:{a:[2,5],aB:1,x:[1,8],xB:2,b:[0,10],bB:2},
    medium:{a:[2,7],aB:1,x:[-5,10],xB:2,b:[-10,10],bB:2},
    hard:{a:[2,10],aB:1,x:[-10,12],xB:2,b:[-20,20],bB:3}
  }
};

function algParams(mode){
  const lvl=boost();
  const C=ALG_CONFIGS[mode][S.diff];
  const a=rnd(C.a[0],C.a[1]+lvl*(C.aB||0));
  const x=rnd(C.x[0],C.x[1]+lvl*(C.xB||0));
  let b=rnd(C.b[0],C.b[1]+lvl*(C.bB||0));
  if(C.bSign && Math.random()<C.bSign) b=-b;
  if(mode==='bothsides'){
    const c=rnd(1,Math.max(1,a-1));
    return {a,b,c,d:(a-c)*x+b,x};
  }
  return {a,b,c:a*x+b,x};
}

function genAlgebra(){
  const mode=S.algMode;
  const p=algParams(mode);
  S.answer=p.x;
  const lhs=formatTerm(p.a,'x')+formatConst(p.b);
  const rhs=mode==='bothsides' ? formatTerm(p.c,'x')+formatConst(p.d) : String(p.c);
  return {display:`${lhs} = ${rhs}`,sub:'résoudre pour x'};
}

function formatTerm(coeff,variable){
  if(coeff===1)return variable;
  if(coeff===-1)return '−'+variable;
  if(coeff<0)return '−'+Math.abs(coeff)+variable;
  return coeff+variable;
}

function formatConst(n){
  if(n===0)return '';
  if(n>0)return ' + '+n;
  return ' − '+Math.abs(n);
}

/* ── MATRICES ── */
const MAT_RANGES={
  easy:{min:1,max:5},
  medium:{min:-9,max:9},
  hard:{min:-15,max:20}
};
const MAT3_RANGES={
  easy:{min:0,max:4},
  medium:{min:-5,max:5},
  hard:{min:-7,max:7}
};

function matRnd(is3x3){
  const r=is3x3?MAT3_RANGES[S.diff]:MAT_RANGES[S.diff];
  const b=boost(2);
  return rnd(r.min-b,r.max+b);
}

function genMatrix(rows,cols,is3x3){
  return Array.from({length:rows},()=>Array.from({length:cols},()=>matRnd(is3x3)));
}

function renderMatrix(mat){
  const cls=mat.length===3?'matrix m3x3':'matrix';
  const rows=mat.map(row=>
    '<div class="matrix-row">'+row.map(v=>`<span class="mcell">${v}</span>`).join('')+'</div>'
  ).join('');
  return `<div class="${cls}">${rows}</div>`;
}

function det2x2(m){return m[0][0]*m[1][1]-m[0][1]*m[1][0]}
function det3x3(m){
  return m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])
        -m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])
        +m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
}
function trace(m){let t=0;for(let i=0;i<m.length;i++)t+=m[i][i];return t}

function genMatrice(){
  const mode=S.matMode;
  let html='',sub='',prefix='',ans;
  if(mode==='det2'||mode==='det3'){
    const size=mode==='det2'?2:3;
    const m=genMatrix(size,size,size===3);
    ans=size===2?det2x2(m):det3x3(m);
    html=renderMatrix(m);sub='déterminant';prefix='det =';
  }else if(mode==='trace'){
    const size=S.diff==='hard'?3:2;
    const m=genMatrix(size,size,size===3);
    ans=trace(m);html=renderMatrix(m);sub='trace (somme diagonale)';prefix='tr =';
  }else{
    const a=genMatrix(2,2,false),b=genMatrix(2,2,false);
    const ti=rnd(0,1),tj=rnd(0,1);
    ans=a[ti][0]*b[0][tj]+a[ti][1]*b[1][tj];
    html=renderMatrix(a)+'<span class="matrix-op">×</span>'+renderMatrix(b);
    sub=`élément (${ti+1},${tj+1}) du résultat`;
    prefix=`(${ti+1},${tj+1}) =`;
  }
  S.answer=ans;
  return {display:'',sub,html:true,htmlContent:html,prefix};
}

/* ── GAME REGISTRY ── */
const GENERATORS={calcul:genCalcul,algebra:genAlgebra,matrices:genMatrice};

/* ── ENGINE ── */
function updateDiffIndicator(){
  const labels=['','lvl +1','lvl +2','lvl +3'];
  E.diffIndicator.textContent=labels[boost()]||'';
}

function nextProblem(){
  const p=GENERATORS[S.game]();
  if(p.html){
    E.problem.classList.add('matrix-mode');
    E.problem.innerHTML=p.htmlContent;
    E.inputPrefix.textContent=p.prefix||'';
  }else{
    E.problem.classList.remove('matrix-mode');
    E.problem.textContent=p.display;
    E.inputPrefix.textContent=S.game==='algebra'?'x =':'';
  }
  E.problemSub.textContent=p.sub||'';
  E.answer.value='';
  E.answer.classList.remove('wrong');
  updateDiffIndicator();
}

function addStreakDot(hit){
  S.history.push(hit);
  const dot=document.createElement('div');
  dot.className='streak-dot '+(hit?'hit':'miss');
  E.streakDots.appendChild(dot);
  while(S.history.length>STREAK_CAP){
    S.history.shift();
    E.streakDots.removeChild(E.streakDots.firstChild);
  }
}

function updateStats(){
  if(!S.running) return;
  const elapsed=(Date.now()-S.startTime)/1000;
  const cpm=elapsed>0?Math.round(S.correctCount/(elapsed/60)):0;
  const ls=S.lastStats;
  if(cpm!==ls.cpm){E.cpm.textContent=cpm;ls.cpm=cpm;}
  if(S.correctCount!==ls.correct){E.correct.textContent=S.correctCount;ls.correct=S.correctCount;}
  if(S.errorCount!==ls.errors){E.errors.textContent=S.errorCount;ls.errors=S.errorCount;}
  if(S.currentStreak!==ls.streak){E.streak.textContent=S.currentStreak;ls.streak=S.currentStreak;}
}

function updateTimer(){
  if(!S.running) return;
  const elapsed=(Date.now()-S.startTime)/1000;
  E.timerFill.style.width=Math.max(0,1-elapsed/S.time)*100+'%';
  if(elapsed>=S.time) endGame();
}

function startGame(){
  S.correctCount=0;S.errorCount=0;S.currentStreak=0;S.bestStreak=0;
  S.history=[];S.adaptiveDiff=1;
  S.lastStats={cpm:-1,correct:-1,errors:-1,streak:-1};
  E.streakDots.innerHTML='';
  showScreen('gameScreen');
  S.startTime=Date.now();S.running=true;
  updateStats();
  E.timerFill.style.width='100%';
  nextProblem();
  E.answer.focus();
  S.interval=setInterval(()=>{updateTimer();updateStats();},TICK_MS);
}

function endGame(){
  S.running=false;
  clearInterval(S.interval);
  const cpm=Math.round(S.correctCount/(S.time/60));
  const total=S.correctCount+S.errorCount;
  const acc=total>0?Math.round(S.correctCount/total*100):0;
  showScreen('resultScreen');
  E.rCpm.textContent=cpm;
  E.rAcc.textContent=acc+'%';
  E.rCorrect.textContent=S.correctCount;
  E.rStreak.textContent=S.bestStreak;
  if(total>0) recordScore(cpm,acc);
}

function checkAnswer(){
  const v=E.answer.value.trim();
  if(!v) return;
  const n=parseInt(v,10);
  if(isNaN(n)) return;
  if(n===S.answer){
    S.correctCount++;S.currentStreak++;
    S.adaptiveDiff+=CORRECT_BONUS;
    if(S.currentStreak>S.bestStreak) S.bestStreak=S.currentStreak;
    addStreakDot(true);
    nextProblem();
  }else{
    S.errorCount++;S.currentStreak=0;
    S.adaptiveDiff=Math.max(1,S.adaptiveDiff-ERROR_PENALTY);
    addStreakDot(false);
    E.answer.classList.add('wrong');
    E.answer.value='';
    setTimeout(()=>E.answer.classList.remove('wrong'),SHAKE_MS);
  }
  updateStats();
}

/* ── GAME TAB SWITCHING ── */
function switchGame(game){
  S.game=game;
  if(S.running){S.running=false;clearInterval(S.interval);}
  setActive('.game-tab',document.querySelector(`[data-game="${game}"]`));
  for(const [g,id] of Object.entries(MODE_PANELS)){
    E[id].style.display=(game===g?'':'none');
  }
  E.problem.classList.remove('matrix-mode');
  E.startMsg.innerHTML=START_MSGS[game];
  showScreen('startScreen');
  renderScorePanel(false);
}

/* ── MODE BAR: data-attribute → state setter registry ── */
const MODE_ATTRS=[
  {attr:'mode',sel:'[data-mode]',apply:v=>S.mode=v},
  {attr:'alg', sel:'[data-alg]', apply:v=>S.algMode=v},
  {attr:'mat', sel:'[data-mat]', apply:v=>S.matMode=v},
  {attr:'time',sel:'[data-time]',apply:v=>{S.time=parseInt(v);renderScorePanel(false);}},
  {attr:'diff',sel:'[data-diff]',apply:v=>S.diff=v}
];

/* ── EVENT LISTENERS ── */
E.answer.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&S.running) checkAnswer();
});

E.startBtn.addEventListener('click',startGame);
E.retryBtn.addEventListener('click',startGame);

E.gameTabs.addEventListener('click',e=>{
  const tab=e.target.closest('.game-tab');
  if(tab) switchGame(tab.dataset.game);
});

E.modeBar.addEventListener('click',e=>{
  const btn=e.target.closest('.mode-btn');
  if(!btn) return;
  for(const {attr,sel,apply} of MODE_ATTRS){
    const v=btn.dataset[attr];
    if(v===undefined) continue;
    setActive(sel,btn);
    apply(v);
    return;
  }
});

document.addEventListener('keydown',e=>{
  if(S.running) return;
  if(e.key!=='Enter'&&e.key!==' ') return;
  if(E.startScreen.style.display!=='none'||E.resultScreen.style.display!=='none') startGame();
});

renderScorePanel(false);
