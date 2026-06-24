/* ════════════════════════════════════════════
   MAKEUP STUDIO — quản lý nghề makeup
   Kiến trúc (giống Finance app):
   - localStorage-first: hiện app NGAY bằng dữ liệu máy, không chờ mạng.
   - Firebase Realtime DB: đồng bộ đa thiết bị (<1s), merge theo từng-mục.
   - Dữ liệu lưu ở nhánh riêng: makeupUsers/{uid} (KHÔNG đụng app finance).
════════════════════════════════════════════ */

const PAGES=['dashboard','clients','capital','stats','settings'];
const THEMES=[
  {id:'rose',bg:'#1a1013',ac:'#fb7185'},
  {id:'grape',bg:'#140a1c',ac:'#c084fc'},
  {id:'sunset',bg:'#1c0f12',ac:'#ff8a5c'},
  {id:'mocha',bg:'#181210',ac:'#d4a373'},
  {id:'dark',bg:'#0c0a0c',ac:'#f472b6'},
  {id:'light',bg:'#fdf6f8',ac:'#e0567f'}
];
const DEF_SERVICES=['Cô dâu','Dự tiệc','Makeup cá nhân','Kỷ yếu','Chụp ảnh','Khác'];
const SERVICE_EMOJI={'Cô dâu':'👰','Dự tiệc':'🎉','Makeup cá nhân':'💄','Kỷ yếu':'🎓','Chụp ảnh':'📸','Khác':'💋'};

/* ── STATE (load từ localStorage) ── */
let clients=JSON.parse(localStorage.getItem('mk_clients')||'[]');
let courses=JSON.parse(localStorage.getItem('mk_courses')||'[]');
let cosmetics=JSON.parse(localStorage.getItem('mk_cosmetics')||'[]');
let services=JSON.parse(localStorage.getItem('mk_services')||'null')||DEF_SERVICES.slice();
let theme=localStorage.getItem('mk_theme')||'rose';
let soundOn=localStorage.getItem('mk_sound')!=='false';
let privacyOn=localStorage.getItem('mk_privacy')==='1';

/* ── HELPERS ── */
const $=id=>document.getElementById(id);
const fmt=n=>'₫'+Math.round(Math.abs(n)).toLocaleString('vi-VN');
const fmtSigned=n=>(n<0?'−':'')+'₫'+Math.round(Math.abs(n)).toLocaleString('vi-VN');
const dateStr=iso=>new Date(iso).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'});
const fullDate=iso=>new Date(iso).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'});
const todayISO=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const svcEmoji=s=>SERVICE_EMOJI[s]||'💋';

/* SMART INPUT: gõ 500 → 500.000₫ (×1000) */
function smartAmount(raw){const n=parseFloat(raw);if(!n||isNaN(n))return 0;return n*1000;}
function smartPreview(input,previewId){const n=parseFloat(input.value);const el=$(previewId);if(!el)return;if(!n||isNaN(n)){el.textContent='';return;}el.textContent='= '+fmt(n*1000);}

/* ── SOUND + HAPTIC ── */
let audioCtx=null;
function ensureAudio(){if(!audioCtx){try{audioCtx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}}return audioCtx;}
function playClick(){if(!soundOn)return;const c=ensureAudio();if(!c)return;const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=820;g.gain.value=.06;o.start();g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.08);o.stop(c.currentTime+.08);}
function playSuccess(){if(!soundOn)return;const c=ensureAudio();if(!c)return;[880,1320].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=f;g.gain.value=.05;o.start(c.currentTime+i*.08);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+i*.08+.1);o.stop(c.currentTime+i*.08+.1);});}
let _hapticLast=0;
function hapticTap(){const now=(window.performance&&performance.now)?performance.now():Date.now();if(now-_hapticLast<40)return;_hapticLast=now;try{if(navigator.vibrate)navigator.vibrate(8);}catch(e){}}
document.addEventListener('pointerdown',function(e){if(e.pointerType==='mouse')return;const t=e.target.closest('button,.btn,.btn-full,.nav-item,.gn-item,.fab,.chip,.seg-btn,.theme-btn,.item,.item-del,[onclick],input[type="checkbox"],select');if(t)hapticTap();},{passive:true,capture:true});

/* ── TOAST ── */
function showToast(msg,ok=true){const t=$('toast');if(!t)return;t.textContent=(ok?'✓ ':'✗ ')+msg;t.style.borderColor=ok?'rgba(34,197,94,.4)':'rgba(239,68,68,.4)';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}

/* ── PERSIST ── */
function saveClients(){localStorage.setItem('mk_clients',JSON.stringify(clients));fbSaveAll();}
function saveCourses(){localStorage.setItem('mk_courses',JSON.stringify(courses));fbSaveAll();}
function saveCosmetics(){localStorage.setItem('mk_cosmetics',JSON.stringify(cosmetics));fbSaveAll();}
function saveServices(){localStorage.setItem('mk_services',JSON.stringify(services));fbSaveAll();}

/* ── NAV ── */
function showPage(p){
  playClick();
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  const pg=$('page-'+p);if(pg)pg.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.page===p));
  document.querySelectorAll('.gn-item').forEach(el=>el.classList.toggle('active',el.dataset.page===p));
  gnSync();
  if(p==='clients')renderClients();
  if(p==='capital')renderCapital();
  if(p==='stats')renderStats();
  if(p==='settings')renderSettings();
  window.scrollTo({top:0,behavior:'smooth'});
}
/* mobile glass-nav pill */
function gnSync(instant){
  const nav=$('glassNav');if(!nav||nav.offsetParent===null)return;
  const active=nav.querySelector('.gn-item.active');const pill=$('gnPill');if(!active||!pill)return;
  const r=active.getBoundingClientRect(),nr=nav.getBoundingClientRect();
  pill.style.width=r.width+'px';
  pill.style.transform='translateX('+(r.left-nr.left-6)+'px)';
  if(instant){pill.style.transition='none';requestAnimationFrame(()=>{pill.style.transition='';});}
}
document.querySelectorAll('.gn-item').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
window.addEventListener('resize',()=>gnSync(true));

/* ════════ COMPUTED ════════ */
function totalCourses(){return courses.reduce((s,c)=>s+(+c.amount||0),0);}
function totalCosmetics(){return cosmetics.reduce((s,c)=>s+(+c.amount||0),0);}
function totalCapital(){return totalCourses()+totalCosmetics();}
function totalRevenue(){return clients.reduce((s,c)=>s+(+c.revenue||0),0);}
function totalSessionCost(){return clients.reduce((s,c)=>s+(+c.cost||0),0);}
function clientCount(){return clients.length;}
function avgRevenue(){return clientCount()?totalRevenue()/clientCount():0;}
/* Lợi nhuận thực = doanh thu − vốn − chi phí mỹ phẩm theo buổi */
function netProfit(){return totalRevenue()-totalCapital()-totalSessionCost();}
/* % hồi vốn = doanh thu / vốn */
function breakEvenPct(){const cap=totalCapital();if(cap<=0)return clientCount()?100:0;return totalRevenue()/cap*100;}

/* ════════ DASHBOARD ════════ */
function updateAll(){
  const rev=totalRevenue(),cap=totalCapital(),profit=netProfit(),n=clientCount(),avg=avgRevenue();
  $('dashMetrics').innerHTML=`
    <div class="metric" data-m="rev"><div class="label">💰 Tổng doanh thu</div><div class="val val-green blurable">${fmt(rev)}</div><div class="sub-val">${n} khách đã làm</div></div>
    <div class="metric" data-m="cap"><div class="label">🎓 Tổng vốn bỏ ra</div><div class="val val-accent blurable">${fmt(cap)}</div><div class="sub-val">Học + mỹ phẩm</div></div>
    <div class="metric" data-m="profit"><div class="label">📈 Lợi nhuận thực</div><div class="val ${profit>=0?'val-green':'val-red'} blurable">${fmtSigned(profit)}</div><div class="sub-val">${profit>=0?'Đã có lời':'Chưa hồi vốn'}</div></div>
    <div class="metric" data-m="count"><div class="label">💋 Số khách</div><div class="val val-white">${n}</div><div class="sub-val">khách hàng</div></div>
    <div class="metric" data-m="avg"><div class="label">⭐ TB mỗi khách</div><div class="val val-accent blurable">${fmt(avg)}</div><div class="sub-val">doanh thu / khách</div></div>`;
  renderBeCard('beCard');
  renderRecentClients();
  applyPrivacy();
  try{animMetrics({rev,cap,profit,count:n,avg});}catch(e){}
}

function renderBeCard(targetId){
  const el=$(targetId);if(!el)return;
  const cap=totalCapital(),rev=totalRevenue(),avg=avgRevenue();
  const pct=breakEvenPct();
  const shown=Math.min(100,pct);
  const done=rev>=cap&&cap>0;
  const remain=Math.max(0,cap-rev);
  let noteHtml;
  if(cap<=0){
    noteHtml=`Chưa nhập vốn đầu tư. Vào tab <b>🎓 Vốn đầu tư</b> để nhập tiền học & mỹ phẩm — app sẽ tính bạn cần bao nhiêu khách thì hồi vốn.`;
  }else if(done){
    noteHtml=`🎉 Chúc mừng! Bạn đã <b>hồi đủ vốn</b> và đang lời <b>${fmt(rev-cap)}</b>. Mỗi khách từ giờ là lợi nhuận thêm.`;
  }else{
    const needClients=avg>0?Math.ceil(remain/avg):null;
    noteHtml=`Còn thiếu <b>${fmt(remain)}</b> nữa là hồi vốn.`+(needClients?` Với mức TB <b>${fmt(avg)}</b>/khách, bạn cần thêm khoảng <b>${needClients} khách</b> nữa.`:` Thêm vài khách để app ước tính số khách cần.`);
  }
  el.innerHTML=`
    <div class="be-head">
      <div class="be-title">🎯 Tiến độ hồi vốn</div>
      <div class="be-pct ${done?'done':''}">${pct.toFixed(0)}%</div>
    </div>
    <div class="be-bar"><div class="be-fill ${done?'done':''}" id="beFill_${targetId}" style="width:0"></div></div>
    <div class="be-stats">
      <div class="be-stat"><div class="l">Đã thu về</div><div class="v val-green blurable">${fmt(rev)}</div></div>
      <div class="be-stat"><div class="l">${done?'Đang lời':'Còn cần thu'}</div><div class="v ${done?'val-green':'val-accent'} blurable">${fmt(done?rev-cap:remain)}</div></div>
    </div>
    <div class="be-note">${noteHtml}</div>`;
  requestAnimationFrame(()=>{const f=$('beFill_'+targetId);if(f)f.style.width=shown+'%';});
}

function clientRowHtml(c){
  return `<div class="item" onclick="openEdit('${c.id}')">
    <div class="item-ava">${svcEmoji(c.service)}</div>
    <div class="item-info">
      <div class="item-name">${esc(c.name)||'Khách'}${c.cost>0?'<span class="badge">+CP</span>':''}</div>
      <div class="item-meta">${esc(c.service||'Khác')} · ${fullDate(c.date)}${c.note?' · '+esc(c.note):''}</div>
    </div>
    <div class="item-right">
      <div class="item-amt val-green blurable">+${fmt(c.revenue)}</div>
      ${c.cost>0?`<div class="item-sub blurable">CP: ${fmt(c.cost)}</div>`:''}
    </div>
    <span class="item-del" onclick="event.stopPropagation();deleteClient('${c.id}')">✕</span>
  </div>`;
}
function renderRecentClients(){
  const el=$('recentClients');if(!el)return;
  const sorted=[...clients].sort((a,b)=>new Date(b.date)-new Date(a.date)||b.id-a.id).slice(0,8);
  el.innerHTML=sorted.length?sorted.map(clientRowHtml).join(''):'<div class="empty">Chưa có khách nào. Thêm khách đầu tiên ở trên 👆</div>';
}

/* ════════ ADD CLIENT ════════ */
function addClient(){ // quick add (dashboard)
  const name=$('qcName').value.trim();
  const service=$('qcService').value;
  const revenue=smartAmount($('qcRevenue').value);
  const cost=smartAmount($('qcCost').value);
  if(!revenue){showToast('Nhập doanh thu',false);return;}
  clients.push({id:String(Date.now()),name:name||'Khách lẻ',service,revenue,cost,date:todayISO(),note:''});
  saveClients();
  $('qcName').value='';$('qcRevenue').value='';$('qcCost').value='';$('qcRevenueP').textContent='';$('qcCostP').textContent='';
  updateAll();playSuccess();showToast('Đã thêm khách: '+(name||'Khách lẻ'));
}
function addClientFull(){
  const name=$('cName').value.trim();
  const service=$('cService').value;
  const revenue=smartAmount($('cRevenue').value);
  const cost=smartAmount($('cCost').value);
  const date=$('cDate').value||todayISO();
  const note=$('cNote').value.trim();
  if(!revenue){showToast('Nhập doanh thu',false);return;}
  clients.push({id:String(Date.now()),name:name||'Khách lẻ',service,revenue,cost,date,note});
  saveClients();
  ['cName','cRevenue','cCost','cNote'].forEach(i=>$(i).value='');$('cRevenueP').textContent='';$('cCostP').textContent='';$('cDate').value=todayISO();
  renderClients();updateAll();playSuccess();showToast('Đã thêm khách: '+(name||'Khách lẻ'));
}
function deleteClient(id){
  const c=clients.find(x=>String(x.id)===String(id));if(!c)return;
  if(!confirm('Xoá khách "'+(c.name||'Khách')+'"?'))return;
  clients=clients.filter(x=>String(x.id)!==String(id));saveClients();
  renderClients();updateAll();playClick();
}

/* ════════ CLIENTS PAGE ════════ */
function renderClients(){
  $('clientsSub').textContent=clientCount()+' khách · '+fmt(totalRevenue())+' doanh thu';
  const q=($('cFilterText').value||'').trim().toLowerCase();
  const svc=$('cFilterService').value;
  const month=$('cFilterMonth').value;
  let f=[...clients].sort((a,b)=>new Date(b.date)-new Date(a.date)||b.id-a.id);
  if(q)f=f.filter(c=>(c.name||'').toLowerCase().includes(q)||(c.note||'').toLowerCase().includes(q));
  if(svc&&svc!=='all')f=f.filter(c=>c.service===svc);
  if(month)f=f.filter(c=>(c.date||'').slice(0,7)===month);
  $('clientsList').innerHTML=f.length?f.map(clientRowHtml).join(''):'<div class="empty">Không có khách nào khớp bộ lọc</div>';
}

/* ════════ CAPITAL PAGE ════════ */
function renderCapital(){
  const tc=totalCourses(),tm=totalCosmetics(),tcap=tc+tm;
  $('capMetrics').innerHTML=`
    <div class="metric"><div class="label">🎓 Tiền đã học</div><div class="val val-accent blurable">${fmt(tc)}</div><div class="sub-val">${courses.length} khoá</div></div>
    <div class="metric"><div class="label">💅 Tiền mỹ phẩm</div><div class="val blurable" style="color:var(--accent2)">${fmt(tm)}</div><div class="sub-val">${cosmetics.length} món</div></div>
    <div class="metric"><div class="label">💰 Tổng vốn</div><div class="val val-white blurable">${fmt(tcap)}</div><div class="sub-val">Học + mỹ phẩm</div></div>`;
  $('totalCourses').textContent=fmt(tc);
  $('totalCosmetics').textContent=fmt(tm);
  const cl=$('coursesList');
  cl.innerHTML=courses.length?[...courses].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(c=>`
    <div class="item">
      <div class="item-ava">🎓</div>
      <div class="item-info"><div class="item-name">${esc(c.name)||'Khoá học'}</div><div class="item-meta">${fullDate(c.date)}</div></div>
      <div class="item-right"><div class="item-amt val-accent blurable">${fmt(c.amount)}</div></div>
      <span class="item-del" onclick="deleteCourse('${c.id}')">✕</span>
    </div>`).join(''):'<div class="empty">Chưa có khoá học nào</div>';
  const ml=$('cosmeticsList');
  ml.innerHTML=cosmetics.length?[...cosmetics].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(c=>`
    <div class="item">
      <div class="item-ava">💅</div>
      <div class="item-info"><div class="item-name">${esc(c.name)||'Mỹ phẩm'}</div><div class="item-meta">${fullDate(c.date)}</div></div>
      <div class="item-right"><div class="item-amt blurable" style="color:var(--accent2)">${fmt(c.amount)}</div></div>
      <span class="item-del" onclick="deleteCosmetic('${c.id}')">✕</span>
    </div>`).join(''):'<div class="empty">Chưa có mỹ phẩm nào</div>';
  applyPrivacy();
}
function addCourse(){
  const name=$('courseName').value.trim();const amt=smartAmount($('courseAmt').value);const date=$('courseDate').value||todayISO();
  if(!amt){showToast('Nhập học phí',false);return;}
  courses.push({id:String(Date.now()),name:name||'Khoá học',amount:amt,date});saveCourses();
  $('courseName').value='';$('courseAmt').value='';$('courseAmtP').textContent='';$('courseDate').value=todayISO();
  renderCapital();updateAll();playSuccess();showToast('Đã thêm khoá học');
}
function deleteCourse(id){if(!confirm('Xoá khoá học này?'))return;courses=courses.filter(c=>String(c.id)!==String(id));saveCourses();renderCapital();updateAll();playClick();}
function addCosmetic(){
  const name=$('cosName').value.trim();const amt=smartAmount($('cosAmt').value);const date=$('cosDate').value||todayISO();
  if(!amt){showToast('Nhập giá tiền',false);return;}
  cosmetics.push({id:String(Date.now()),name:name||'Mỹ phẩm',amount:amt,date});saveCosmetics();
  $('cosName').value='';$('cosAmt').value='';$('cosAmtP').textContent='';$('cosDate').value=todayISO();
  renderCapital();updateAll();playSuccess();showToast('Đã thêm mỹ phẩm');
}
function deleteCosmetic(id){if(!confirm('Xoá món mỹ phẩm này?'))return;cosmetics=cosmetics.filter(c=>String(c.id)!==String(id));saveCosmetics();renderCapital();updateAll();playClick();}

/* ════════ STATS PAGE ════════ */
let charts={};
function renderStats(){
  $('statsSub').textContent=clientCount()+' khách · '+fmt(totalRevenue())+' doanh thu';
  renderBeCard('statsBeCard');
  renderRevChart();
  renderServiceChart();
  renderServiceBreakdown();
}
function lastNMonths(n){
  const arr=[];const now=new Date();
  for(let i=n-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);arr.push({key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:(d.getMonth()+1)+'/'+String(d.getFullYear()).slice(2)});}
  return arr;
}
function renderRevChart(){
  if(typeof Chart==='undefined')return;
  const months=lastNMonths(6);
  const data=months.map(m=>clients.filter(c=>(c.date||'').slice(0,7)===m.key).reduce((s,c)=>s+(+c.revenue||0),0));
  if(charts.rev)charts.rev.destroy();
  charts.rev=new Chart($('revChart'),{type:'bar',data:{labels:months.map(m=>m.label),datasets:[{data,backgroundColor:'rgba(251,113,133,.6)',borderColor:'#fb7185',borderWidth:1,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}},scales:{y:{ticks:{color:'#bd909e',font:{size:9},callback:v=>v>=1e6?(v/1e6).toFixed(0)+'tr':v/1e3+'k'},grid:{color:'rgba(255,255,255,.04)'}},x:{ticks:{color:'#bd909e',font:{size:10}},grid:{display:false}}}}});
}
function renderServiceChart(){
  if(typeof Chart==='undefined')return;
  const byS={};clients.forEach(c=>{const k=c.service||'Khác';byS[k]=(byS[k]||0)+(+c.revenue||0);});
  const labels=Object.keys(byS),data=labels.map(k=>byS[k]);
  const colors=['#fb7185','#f0abfc','#c084fc','#ff8a5c','#fbbf24','#60a5fa','#22c55e','#d4a373'];
  const empty=!labels.length;
  if(charts.svc)charts.svc.destroy();
  charts.svc=new Chart($('serviceChart'),{type:'doughnut',data:{labels:empty?['Chưa có dữ liệu']:labels,datasets:[{data:empty?[1]:data,backgroundColor:empty?['#33333a']:colors,borderWidth:0,hoverOffset:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:10},color:'#bd909e',boxWidth:8,padding:8}},tooltip:{callbacks:{label:c=>empty?'Chưa có':(' '+c.label+': '+fmt(c.raw))}}}}});
}
function renderServiceBreakdown(){
  const byS={};clients.forEach(c=>{const k=c.service||'Khác';if(!byS[k])byS[k]={count:0,rev:0};byS[k].count++;byS[k].rev+=(+c.revenue||0);});
  const rows=Object.keys(byS).map(k=>({k,...byS[k]})).sort((a,b)=>b.rev-a.rev);
  const total=totalRevenue()||1;
  $('serviceBreakdown').innerHTML=rows.length?rows.map(r=>`
    <div class="item" style="cursor:default">
      <div class="item-ava">${svcEmoji(r.k)}</div>
      <div class="item-info"><div class="item-name">${esc(r.k)}</div><div class="item-meta">${r.count} khách · ${(r.rev/total*100).toFixed(0)}% doanh thu</div></div>
      <div class="item-right"><div class="item-amt val-accent blurable">${fmt(r.rev)}</div><div class="item-sub blurable">TB ${fmt(r.rev/r.count)}</div></div>
    </div>`).join(''):'<div class="empty">Chưa có dữ liệu</div>';
  applyPrivacy();
}

/* ════════ SETTINGS ════════ */
function buildServiceSelects(){
  const opts=services.map(s=>`<option value="${esc(s)}">${svcEmoji(s)} ${esc(s)}</option>`).join('');
  ['qcService','cService','eService'].forEach(id=>{const el=$(id);if(el){const v=el.value;el.innerHTML=opts;if(services.includes(v))el.value=v;}});
  const fc=$('cFilterService');if(fc){const v=fc.value;fc.innerHTML='<option value="all">Mọi dịch vụ</option>'+opts;fc.value=services.includes(v)?v:'all';}
  // quick chips
  ['quickServiceRow','cServiceRow'].forEach(id=>{
    const row=$(id);if(!row)return;
    const target=id==='quickServiceRow'?'qcService':'cService';
    row.innerHTML=services.slice(0,5).map(s=>`<button type="button" class="chip" onclick="pickService('${target}','${esc(s)}',this)">${svcEmoji(s)} ${esc(s)}</button>`).join('');
  });
}
function pickService(selId,name,btn){playClick();const el=$(selId);if(el)el.value=name;if(btn){btn.parentNode.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));btn.classList.add('on');}}
function addService(){
  const name=$('newService').value.trim();if(!name){showToast('Nhập tên dịch vụ',false);return;}
  if(services.includes(name)){showToast('Đã tồn tại',false);return;}
  services.push(name);saveServices();$('newService').value='';buildServiceSelects();renderSettings();playSuccess();showToast('Đã thêm: '+name);
}
function deleteService(name){
  if(services.length<=1){showToast('Phải có ít nhất 1 dịch vụ',false);return;}
  if(!confirm('Xoá dịch vụ "'+name+'"? (Khách cũ vẫn giữ tên dịch vụ này)'))return;
  services=services.filter(s=>s!==name);saveServices();buildServiceSelects();renderSettings();
}
function renderSettings(){
  $('themeRow').innerHTML=THEMES.map(t=>`<button class="theme-btn ${t.id===theme?'on':''}" style="background:linear-gradient(135deg,${t.bg},${t.ac})" onclick="setTheme('${t.id}')" title="${t.id}"></button>`).join('');
  $('soundToggle').className='toggle'+(soundOn?' on':'');
  $('privacyToggle').className='toggle'+(privacyOn?' on':'');
  $('serviceTags').innerHTML=services.map(s=>`<span class="cat-tag">${svcEmoji(s)} ${esc(s)} <span class="x" onclick="deleteService('${esc(s)}')">✕</span></span>`).join('');
  renderSyncStatus();
}
function setTheme(t){theme=t;document.body.setAttribute('data-theme',t);localStorage.setItem('mk_theme',t);const m=document.querySelector('meta[name=theme-color]');const td=THEMES.find(x=>x.id===t);if(m&&td)m.setAttribute('content',td.bg);renderSettings();}
function toggleSound(){soundOn=!soundOn;localStorage.setItem('mk_sound',soundOn);$('soundToggle').className='toggle'+(soundOn?' on':'');if(soundOn)playClick();}
function togglePrivacy(){privacyOn=!privacyOn;localStorage.setItem('mk_privacy',privacyOn?'1':'0');const t=$('privacyToggle');if(t)t.className='toggle'+(privacyOn?' on':'');applyPrivacy();}
function applyPrivacy(){document.body.classList.toggle('privacy',privacyOn);}

/* ════════ EDIT CLIENT MODAL ════════ */
let editId=null;
function openEdit(id){
  const c=clients.find(x=>String(x.id)===String(id));if(!c)return;editId=String(id);
  buildServiceSelects();
  $('eName').value=c.name||'';$('eService').value=c.service||services[0];
  $('eRevenue').value=c.revenue?c.revenue/1000:'';$('eCost').value=c.cost?c.cost/1000:'';
  $('eDate').value=(c.date||todayISO()).slice(0,10);$('eNote').value=c.note||'';
  $('editOverlay').classList.add('show');
}
function closeEdit(){$('editOverlay').classList.remove('show');editId=null;}
function saveEdit(){
  const c=clients.find(x=>String(x.id)===String(editId));if(!c)return;
  c.name=$('eName').value.trim()||'Khách lẻ';c.service=$('eService').value;
  c.revenue=smartAmount($('eRevenue').value);c.cost=smartAmount($('eCost').value);
  c.date=$('eDate').value||c.date;c.note=$('eNote').value.trim();
  saveClients();closeEdit();renderClients();updateAll();playSuccess();showToast('Đã lưu thay đổi');
}
function deleteEditClient(){const id=editId;closeEdit();if(id)deleteClient(id);}

/* ════════ BACKUP / RESTORE ════════ */
function exportJSON(){
  const data={v:1,exportedAt:new Date().toISOString(),clients,courses,cosmetics,services};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='makeup-backup-'+todayISO()+'.json';a.click();
  showToast('Đã xuất file sao lưu');
}
function importJSON(e){
  const file=e.target.files[0];if(!file)return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const d=JSON.parse(r.result);
      if(d.clients)clients=d.clients;if(d.courses)courses=d.courses;if(d.cosmetics)cosmetics=d.cosmetics;if(d.services)services=d.services;
      localStorage.setItem('mk_clients',JSON.stringify(clients));
      localStorage.setItem('mk_courses',JSON.stringify(courses));
      localStorage.setItem('mk_cosmetics',JSON.stringify(cosmetics));
      localStorage.setItem('mk_services',JSON.stringify(services));
      fbSaveAll(true);
      buildServiceSelects();updateAll();renderClients();renderCapital();renderSettings();
      showToast('Đã khôi phục dữ liệu');
    }catch(err){showToast('File không hợp lệ',false);}
  };
  r.readAsText(file);e.target.value='';
}
function clearAllData(){
  if(!confirm('Xoá TẤT CẢ dữ liệu trên thiết bị này? Không hoàn tác!'))return;
  if(!confirm('Chắc chắn chứ? Toàn bộ khách, vốn sẽ mất.'))return;
  clients=[];courses=[];cosmetics=[];services=DEF_SERVICES.slice();
  ['mk_clients','mk_courses','mk_cosmetics','mk_services'].forEach(k=>localStorage.removeItem(k));
  fbSaveAll(true);
  buildServiceSelects();updateAll();renderClients();renderCapital();renderSettings();
  showToast('Đã xoá toàn bộ dữ liệu');
}

/* ════════ ANIMATED METRICS ════════ */
function animMetrics(cur){
  const S=animMetrics._s||(animMetrics._s={prev:null,frames:{}});
  const F={rev:v=>fmt(v),cap:v=>fmt(v),profit:v=>fmtSigned(v),count:v=>String(Math.round(v)),avg:v=>fmt(v)};
  if(S.prev){
    Object.keys(cur).forEach(k=>{
      if(S.prev[k]===cur[k])return;
      const card=document.querySelector(`#dashMetrics .metric[data-m="${k}"]`);if(!card)return;
      const el=card.querySelector('.val');if(!el)return;
      card.classList.remove('pulse');void card.offsetWidth;card.classList.add('pulse');
      if(S.frames[k])cancelAnimationFrame(S.frames[k]);
      const from=S.prev[k],to=cur[k],t0=performance.now(),dur=650;
      const step=now=>{const p=Math.min(1,(now-t0)/dur);const e=1-Math.pow(1-p,3);el.textContent=F[k](from+(to-from)*e);if(p<1)S.frames[k]=requestAnimationFrame(step);};
      S.frames[k]=requestAnimationFrame(step);
    });
  }
  S.prev={...cur};
}

/* ════════════════════════════════════════════
   FIREBASE REALTIME SYNC  (nhánh makeupUsers/{uid})
════════════════════════════════════════════ */
var fbActive=false;
const FIREBASE_CONFIG={apiKey:"AIzaSyDTGFDXo390dH3sIZMBmw4J6E6XtBYuTY8",authDomain:"finance-fb03b.firebaseapp.com",databaseURL:"https://finance-fb03b-default-rtdb.asia-southeast1.firebasedatabase.app",projectId:"finance-fb03b",storageBucket:"finance-fb03b.firebasestorage.app",messagingSenderId:"724966318747",appId:"1:724966318747:web:4426dc76d0ec7780a21c3e"};
const FB={auth:null,db:null,ref:null,uid:null,_pushSig:null,_applying:false,_seeded:false,_saveTimer:null,_lastSynced:null};
function fbConfigured(){return typeof firebase!=='undefined'&&FIREBASE_CONFIG&&!!FIREBASE_CONFIG.databaseURL;}

function fbInit(){
  if(!fbConfigured())return;
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    FB.auth=firebase.auth();FB.db=firebase.database();fbActive=true;
    try{FB.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch(e){}
    FB.auth.onAuthStateChanged(function(u){
      if(u){FB.uid=u.uid;hideLogin();fbAttach();$('whoBox').textContent='☁️ '+(u.email||'Đã đăng nhập');}
      else{FB.uid=null;fbDetach();showLogin();$('whoBox').textContent='Chế độ offline';}
      renderSyncStatus();
    });
  }catch(e){console.warn('fb init',e);fbActive=false;hideSplash();}
}
function fbAttach(){
  if(!FB.uid||!FB.db)return;
  FB.ref=FB.db.ref('makeupUsers/'+FB.uid);
  FB.ref.on('value',function(snap){
    const val=snap.val();
    if(val==null){if(!FB._seeded){FB._seeded=true;fbSaveAll(true);}hideSplash();return;}
    FB._seeded=true;fbApply(val);
  });
}
function fbDetach(){if(FB.ref){FB.ref.off();FB.ref=null;}FB._seeded=false;}

function stableStr(o){if(o===null||typeof o!=='object')return JSON.stringify(o);if(Array.isArray(o))return '['+o.map(stableStr).join(',')+']';return '{'+Object.keys(o).sort().map(function(k){return JSON.stringify(k)+':'+stableStr(o[k]);}).join(',')+'}';}
function fbSig(d){
  function coll(obj){return Object.keys(obj||{}).map(k=>stableStr(obj[k])).sort().join('|');}
  const s=typeof d.settings==='string'?d.settings:JSON.stringify(d.settings||{});
  return coll(d.clients)+'#'+coll(d.courses)+'#'+coll(d.cosmetics)+'#'+s;
}
function fbTree(){
  const cl={};clients.forEach(c=>{if(c&&c.id!=null)cl[String(c.id)]=c;});
  const co={};courses.forEach(c=>{if(c&&c.id!=null)co[String(c.id)]=c;});
  const cm={};cosmetics.forEach(c=>{if(c&&c.id!=null)cm[String(c.id)]=c;});
  return {clients:cl,courses:co,cosmetics:cm,settings:JSON.stringify({services})};
}
function fbMergeColl(localArr,serverObj,lastObj){
  const out={};const sv=serverObj||{},last=lastObj||{};
  Object.keys(sv).forEach(id=>{out[id]=sv[id];});
  const localById={};localArr.forEach(x=>{if(x&&x.id!=null)localById[String(x.id)]=x;});
  localArr.forEach(x=>{
    if(!x||x.id==null)return;const id=String(x.id);
    if(!(id in out)&&!(id in last)){out[id]=x;return;}
    if((id in out)&&(id in last)&&stableStr(out[id])===stableStr(last[id])&&stableStr(x)!==stableStr(last[id]))out[id]=x;
  });
  Object.keys(last).forEach(id=>{if(!(id in localById)&&(id in out))delete out[id];});
  return Object.keys(out).map(k=>out[k]);
}
function fbDiff(prev,cur){
  const up={};
  ['clients','courses','cosmetics'].forEach(coll=>{
    const p=prev[coll]||{},c=cur[coll]||{};
    Object.keys(c).forEach(id=>{if(stableStr(c[id])!==stableStr(p[id]))up[coll+'/'+id]=c[id];});
    Object.keys(p).forEach(id=>{if(!(id in c))up[coll+'/'+id]=null;});
  });
  if(prev.settings!==cur.settings)up['settings']=cur.settings;
  return up;
}
function fbApply(val){
  const serverTree={clients:val.clients||{},courses:val.courses||{},cosmetics:val.cosmetics||{},settings:(typeof val.settings==='string'?val.settings:JSON.stringify(val.settings||{}))};
  const sig=fbSig(serverTree);
  if(sig===FB._pushSig){FB._lastSynced=serverTree;hideSplash();return;}
  FB._applying=true;
  try{
    const last=FB._lastSynced||{};
    clients=fbMergeColl(clients,val.clients,last.clients);
    courses=fbMergeColl(courses,val.courses,last.courses);
    cosmetics=fbMergeColl(cosmetics,val.cosmetics,last.cosmetics);
    localStorage.setItem('mk_clients',JSON.stringify(clients));
    localStorage.setItem('mk_courses',JSON.stringify(courses));
    localStorage.setItem('mk_cosmetics',JSON.stringify(cosmetics));
    const lastSetStr=(last&&typeof last.settings==='string')?last.settings:'';
    const keepLocal=lastSetStr!==''&&serverTree.settings===lastSetStr&&fbTree().settings!==lastSetStr;
    if(!keepLocal){
      let s={};try{s=val.settings?(typeof val.settings==='string'?JSON.parse(val.settings):val.settings):{};}catch(e){s={};}
      if(Array.isArray(s.services)&&s.services.length){services=s.services;localStorage.setItem('mk_services',JSON.stringify(services));}
    }
    FB._lastSynced=serverTree;FB._pushSig=sig;
  }catch(e){console.warn('fb apply',e);}
  FB._applying=false;
  try{buildServiceSelects();updateAll();}catch(e){}
  const ap=document.querySelector('.page.active');
  if(ap){const id=ap.id.replace('page-','');const map={clients:renderClients,capital:renderCapital,stats:renderStats,settings:renderSettings};try{(map[id]||function(){})();}catch(e){}}
  hideSplash();
  try{if(Object.keys(fbDiff(serverTree,fbTree())).length)fbSaveAll();}catch(e){}
}
function fbSaveAll(immediate){
  if(!fbActive||!FB.uid||FB._applying||!FB.ref)return;
  clearTimeout(FB._saveTimer);
  const run=function(){
    if(!FB.ref)return;
    const cur=fbTree();FB._pushSig=fbSig(cur);
    const prev=FB._lastSynced;FB._lastSynced=cur;
    const onErr=function(e){console.warn('fb save',e);FB._lastSynced=null;};
    if(!prev){FB.ref.set(cur).catch(onErr);return;}
    const up=fbDiff(prev,cur);if(!Object.keys(up).length)return;
    FB.ref.update(up).catch(onErr);
  };
  if(immediate)run();else FB._saveTimer=setTimeout(run,300);
}

/* ── LOGIN UI ── */
function showLogin(){const el=$('fbLogin');if(el)el.style.display='flex';hideSplash();}
function hideLogin(){const el=$('fbLogin');if(el)el.style.display='none';}
let fbAuthMode='login';
function setAuthMode(m){
  fbAuthMode=m;const signup=(m==='signup');
  document.querySelectorAll('#fbSeg button').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));
  $('fbName').style.display=signup?'':'none';
  $('fbGoBtn').textContent=signup?'Tạo tài khoản':'Đăng nhập';
  $('fbSub').textContent=signup?'Tạo tài khoản mới — dữ liệu riêng tư, đồng bộ mọi thiết bị':'Đăng nhập để đồng bộ giữa điện thoại & máy tính';
  $('fbPass').placeholder=signup?'Mật khẩu (≥ 6 ký tự)':'Mật khẩu';
  $('fbForgot').style.display=signup?'none':'';
  $('fbLoginErr').textContent='';
}
function fbSubmitAuth(e){if(e&&e.preventDefault)e.preventDefault();if(fbAuthMode==='signup')fbDoSignup();else fbDoLogin();}
function fbDoLogin(){if(!FB.auth)return;const em=($('fbEmail').value||'').trim(),pw=$('fbPass').value||'';if(!em||!pw){$('fbLoginErr').textContent='Nhập email & mật khẩu';return;}$('fbLoginErr').textContent='Đang đăng nhập…';FB.auth.signInWithEmailAndPassword(em,pw).then(()=>{$('fbLoginErr').textContent='';$('fbPass').value='';}).catch(err=>{$('fbLoginErr').textContent=fbErrMsg(err);});}
function fbDoSignup(){
  if(!FB.auth)return;const em=($('fbEmail').value||'').trim(),pw=$('fbPass').value||'';
  if(!em||!pw){$('fbLoginErr').textContent='Nhập email & mật khẩu';return;}
  if(pw.length<6){$('fbLoginErr').textContent='Mật khẩu cần ít nhất 6 ký tự';return;}
  $('fbLoginErr').textContent='Đang tạo tài khoản…';
  FB.auth.createUserWithEmailAndPassword(em,pw).then(()=>{$('fbLoginErr').textContent='';$('fbPass').value='';}).catch(err=>{$('fbLoginErr').textContent=fbErrMsg(err);});
}
function fbForgotPassword(){
  if(!FB.auth)return;const em=($('fbEmail').value||'').trim();
  if(!em){$('fbLoginErr').textContent='Nhập email để nhận link đặt lại';return;}
  FB.auth.sendPasswordResetEmail(em).then(()=>{$('fbLoginErr').style.color='var(--green)';$('fbLoginErr').textContent='Đã gửi email đặt lại mật khẩu';}).catch(err=>{$('fbLoginErr').textContent=fbErrMsg(err);});
}
function fbSkip(){hideLogin();hideSplash();showToast('Đang dùng offline — dữ liệu chỉ lưu máy này');}
function fbLogout(){if(FB.auth)FB.auth.signOut();}
function fbErrMsg(err){
  const c=err&&err.code||'';
  if(c.includes('wrong-password')||c.includes('invalid-credential'))return 'Sai email hoặc mật khẩu';
  if(c.includes('user-not-found'))return 'Tài khoản không tồn tại';
  if(c.includes('email-already-in-use'))return 'Email đã được đăng ký';
  if(c.includes('invalid-email'))return 'Email không hợp lệ';
  if(c.includes('network'))return 'Lỗi mạng — thử lại';
  if(c.includes('too-many-requests'))return 'Thử lại sau ít phút';
  return (err&&err.message)||'Có lỗi xảy ra';
}
function renderSyncStatus(){
  const el=$('syncStatus');if(!el)return;
  if(!fbActive){el.innerHTML='Đang khởi tạo đồng bộ… (hoặc đang offline)';return;}
  if(FB.uid){
    const email=(FB.auth&&FB.auth.currentUser&&FB.auth.currentUser.email)||'';
    el.innerHTML=`✅ Đã đăng nhập: <b>${esc(email)}</b><br>Dữ liệu tự đồng bộ real-time giữa các thiết bị.<br><button class="btn btn-red" style="margin-top:10px" onclick="fbLogout()">Đăng xuất</button>`;
  }else{
    el.innerHTML='Chưa đăng nhập — dữ liệu chỉ lưu trên máy này.<br><button class="btn btn-accent" style="margin-top:10px" onclick="showLogin()">Đăng nhập để đồng bộ</button>';
  }
}

/* ── SPLASH ── */
function splash(msg){const m=$('splashMsg');if(m&&msg)m.textContent=msg;}
function hideSplash(){const s=$('appSplash');if(!s)return;s.style.opacity='0';setTimeout(()=>{if(s&&s.parentNode)s.parentNode.removeChild(s);},450);}

/* ════════ INIT ════════ */
function init(){
  document.body.setAttribute('data-theme',theme);
  const td=THEMES.find(x=>x.id===theme);const mc=document.querySelector('meta[name=theme-color]');if(mc&&td)mc.setAttribute('content',td.bg);
  const now=new Date();
  $('dashDate').textContent=now.toLocaleDateString('vi-VN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  $('sidebarDate').textContent=now.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'});
  $('cDate').value=todayISO();$('courseDate').value=todayISO();$('cosDate').value=todayISO();
  buildServiceSelects();updateAll();gnSync(true);applyPrivacy();
  // Chờ Firebase SDK (defer) tối đa ~8s; có thì bật sync, không thì chạy offline
  (function waitFB(n){
    if(typeof firebase!=='undefined'){fbConfigured()?fbInit():hideSplash();return;}
    if(n>160){hideSplash();return;}
    setTimeout(()=>waitFB(n+1),50);
  })(0);
  // Hiện app NGAY bằng dữ liệu máy — không chờ mạng
  setTimeout(hideSplash,1000);
}

/* ════════════════════════════════════════════
   NỀN CANVAS — bokeh hồng + hạt lấp lánh bay lên
   (sprite vẽ sẵn 1 lần, throttle 30fps, dừng khi ẩn tab)
════════════════════════════════════════════ */
(function(){
  const canvas=$('bgCanvas');if(!canvas)return;
  const ctx=canvas.getContext('2d');
  let w,h,raf=null,last=0,t=0;
  const MOBILE=window.innerWidth<768;
  const FRAME=1000/30;
  const N_ORBS=MOBILE?4:6,N_PARTS=MOBILE?16:34;
  function resize(){w=canvas.width=window.innerWidth;h=canvas.height=window.innerHeight;}
  resize();window.addEventListener('resize',resize);
  const HUES=[340,320,300,350,290,330]; // hồng → tím
  const orbs=[];for(let i=0;i<N_ORBS;i++)orbs.push({x:Math.random(),y:Math.random(),r:Math.random()*170+120,vx:(Math.random()-.5)*.0004,vy:(Math.random()-.5)*.0003,hue:HUES[i%HUES.length],phase:Math.random()*Math.PI*2});
  const parts=[];for(let i=0;i<N_PARTS;i++)parts.push({x:Math.random(),y:Math.random(),size:Math.random()*1.8+.5,speed:Math.random()*.0006+.0002,hue:Math.random()>.5?335:300,phase:Math.random()*Math.PI*2,drift:(Math.random()-.5)*.0003});
  function radialSprite(d,stops){const c=document.createElement('canvas');c.width=c.height=d;const g=c.getContext('2d'),r=d/2;const grad=g.createRadialGradient(r,r,0,r,r,r);stops.forEach(s=>grad.addColorStop(s[0],s[1]));g.fillStyle=grad;g.fillRect(0,0,d,d);return c;}
  const glow={};[335,300].forEach(hue=>{glow[hue]=radialSprite(64,[[0,'hsla('+hue+',95%,70%,1)'],[1,'hsla('+hue+',95%,70%,0)']]);});
  const orbSp={};HUES.forEach(hue=>{orbSp[hue]=radialSprite(256,[[0,'hsla('+hue+',80%,62%,.10)'],[.5,'hsla('+hue+',75%,55%,.04)'],[1,'hsla('+hue+',70%,50%,0)']]);});
  function draw(){
    t+=.008;ctx.clearRect(0,0,w,h);
    orbs.forEach(o=>{o.x+=o.vx;o.y+=o.vy;o.phase+=.005;if(o.x<-.2)o.x=1.2;if(o.x>1.2)o.x=-.2;if(o.y<-.2)o.y=1.2;if(o.y>1.2)o.y=-.2;const pulse=Math.sin(o.phase)*.25+.75;const R=o.r*pulse,sp=orbSp[o.hue]||orbSp[340];ctx.drawImage(sp,Math.floor(o.x*w-R),Math.floor(o.y*h-R),R*2,R*2);});
    parts.forEach(p=>{p.y-=p.speed;p.x+=Math.sin(t*2+p.phase)*p.drift;if(p.y<-.02){p.y=1.02;p.x=Math.random();}const a=.25+Math.sin(t*3+p.phase)*.15;ctx.beginPath();ctx.arc(p.x*w,p.y*h,p.size,0,Math.PI*2);ctx.fillStyle='hsla('+p.hue+',95%,75%,'+a+')';ctx.fill();const gr=p.size*5,sp=glow[p.hue]||glow[335];ctx.globalAlpha=a*.3;ctx.drawImage(sp,Math.floor(p.x*w-gr),Math.floor(p.y*h-gr),gr*2,gr*2);ctx.globalAlpha=1;});
  }
  function frame(now){raf=requestAnimationFrame(frame);if((now||0)-last<FRAME)return;last=now||0;draw();}
  function start(){if(!raf)raf=requestAnimationFrame(frame);}
  function stop(){if(raf){cancelAnimationFrame(raf);raf=null;}}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else{last=0;start();}});
  start();
})();

/* keyboard: Esc đóng modal */
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeEdit();});

/* ── SERVICE WORKER ── */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').catch(()=>{});});
}

/* GO */
init();
