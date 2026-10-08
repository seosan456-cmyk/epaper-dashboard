// Device-owned content. Never put these values into the shared calendar cache.
function validateDashboard(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||input.version!==1)throw Error('Invalid dashboard');
  const clean=(value,max,lines=1)=>{
    if(typeof value!=='string'||/[\x00-\x09\x0b-\x1f\x7f]/.test(value))throw Error('입력할 수 없는 문자가 포함되어 있어요.');
    const parts=value.split('\n');
    if(parts.length>lines||parts.some(x=>[...x].length>max))throw Error('이름은 24자, 메모는 한 줄 22자·두 줄까지 입력해 주세요.');
    return value;
  };
  const dated=row=>{
    if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid dated item');
    const title=clean(row.title,24).trim(),date=row.date;
    if(title===''&&date==='')return {title:'',date:''};
    if(!title||typeof date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(date))throw Error('일정 이름과 날짜를 함께 입력해 주세요.');
    const d=new Date(date+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)throw Error('날짜를 2000~2099년의 올바른 날짜로 선택해 주세요.');
    return {title,date};
  };
  if(!Array.isArray(input.notes)||input.notes.length!==2||!Array.isArray(input.important)||input.important.length!==3)throw Error('메모·일정 항목을 다시 확인해 주세요.');
  return {version:1,dday:dated(input.dday),notes:input.notes.map(x=>clean(x,22,2)),important:input.important.map(dated)};
}

const SERVICE='780fe0d0-7253-4fd4-8f93-1475b0a09901';
const RX='780fe0d0-7253-4fd4-8f93-1475b0a09902';
const TX='780fe0d0-7253-4fd4-8f93-1475b0a09903';
const encoder=new TextEncoder();
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function encodeSettings(s){
  for(const [key,max] of [['mode',2],['interval',3],['fullInterval',2],['flags',3],['quietStart',23],['quietEnd',23]]){
    if(!Number.isInteger(s[key])||s[key]<0||s[key]>max)throw Error('설정 값이 올바르지 않아요.');
  }
  const normalized=s.memo.replaceAll('\r\n','\n'),memo=encoder.encode(normalized);
  if(memo.length>600||[...normalized].length>200||/[\x00-\x09\x0b-\x1f\x7f]/.test(normalized))throw Error('메모는 200자·600바이트 이내로 입력해 주세요.');
  if(!s.profiles.length||s.profiles.length>4)throw Error('Wi-Fi를 1~4개 등록해 주세요.');
  if(s.flags&2&&s.quietStart===s.quietEnd)throw Error('야간 정지 시작과 종료 시간을 다르게 선택해 주세요.');
  const result=[s.version===1?1:2,s.mode,s.interval,s.fullInterval,s.flags,s.quietStart,s.quietEnd,s.profiles.length,memo.length&255,memo.length>>8],seen=new Set();
  for(const p of s.profiles){
    const ssid=encoder.encode(p.ssid),password=encoder.encode(p.password||'');
    if(!ssid.length||ssid.length>32||/[\x00-\x1f\x7f]/.test(p.ssid))throw Error('Wi-Fi 이름은 1~32바이트로 입력해 주세요.');
    if(seen.has(p.ssid))throw Error('같은 Wi-Fi 이름을 중복 저장할 수 없어요.');seen.add(p.ssid);
    const mode=p.open?0:password.length?1:p.keep?2:-1;
    if(mode<0||mode===1&&(password.length<8||password.length>63||password.includes(0)))throw Error('Wi-Fi 비밀번호는 8~63바이트예요. 기존 비밀번호는 빈칸으로 유지할 수 있어요.');
    const pass=mode===1?password:[];result.push(ssid.length,mode,pass.length,...ssid,...pass);
  }
  result.push(...memo);
  if(result[0]===2){
    const d=validateDashboard(s.dashboard);
    const put=value=>{const b=encoder.encode(value);result.push(b.length&255,b.length>>8,...b);};
    put(d.dday.title);put(d.dday.date);d.notes.forEach(put);
    for(const row of d.important){put(row.title);put(row.date);}
  }
  if(result.length>3072)throw Error('설정 데이터가 너무 큽니다.');
  return new Uint8Array(result);
}
class BleTransport {
  constructor(rx,tx){this.rx=rx;this.tx=tx;this.seq=0;this.busy=false;this.pending=Promise.resolve();}
  command(op,args=new Uint8Array(),timeout=7000){
    const result=this.pending.then(()=>this.send(op,args,timeout));
    this.pending=result.catch(()=>{});return result;
  }
  async send(op,args,timeout){
    if(args.length>18)throw Error('전송 크기 오류');
    this.busy=true;try{
      this.seq=this.seq%255+1;const seq=this.seq,request=new Uint8Array([seq,op,...args]);
      await this.rx.writeValueWithResponse(request);const start=Date.now();
      while(Date.now()-start<timeout){
        const v=await this.tx.readValue();const bytes=new Uint8Array(v.buffer,v.byteOffset,v.byteLength);
        if(bytes.length<2)throw Error('기기 응답 길이 오류');
        if(bytes[0]===seq){if(bytes[1]!==0)throw Error(({1:'설정 데이터가 올바르지 않아요. 다시 연결해 주세요.',3:'기기에 설정을 저장하지 못했어요.',4:'첫 번째 Wi-Fi에 연결하지 못했어요. 이름·비밀번호·2.4GHz 연결을 확인해 주세요. 이전 설정은 유지됩니다.'})[bytes[1]]||'기기 처리 오류');return bytes.slice(2);}
        await new Promise(r=>setTimeout(r,40));
      }throw Error('기기 응답 시간이 초과됐어요. 저장 중이었다면 다시 연결해 저장된 값을 확인해 주세요.');
    }finally{this.busy=false;}
  }
  async info(){
    const parts=[];let total=0,offset=0;
    do{const b=await this.command(1,new Uint8Array([offset&255,offset>>8]));if(b.length<2)throw Error('기기 정보 응답 오류');
      const announced=b[0]|b[1]<<8;if(announced>8192||offset&&announced!==total)throw Error('기기 정보 크기 오류');total=announced;
      const part=b.slice(2);if(!part.length&&offset<total)throw Error('기기 정보 전송 중단');parts.push(...part);offset+=part.length;
    }while(offset<total);
    if(offset!==total)throw Error('기기 정보 길이 오류');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(parts)));
  }
  async save(s,onProgress=()=>{}){
    const bytes=encodeSettings(s),header=new Uint8Array(6),v=new DataView(header.buffer);v.setUint16(0,bytes.length,true);v.setUint32(2,crc32(bytes),true);
    await this.command(2,header);
    for(let offset=0;offset<bytes.length;offset+=16){await this.command(3,new Uint8Array([offset&255,offset>>8,...bytes.slice(offset,offset+16)]));onProgress(Math.min(100,Math.round((offset+16)/bytes.length*100)));}
    onProgress(100,'commit');await this.command(4,new Uint8Array(),30000);
  }
}


const $=id=>document.getElementById(id);
let device=null,link=null,profiles=[],working=false,expectedDisconnect=false;
let firmwareVersion=1,dirty=false,loaded=false,dashboardConfigured=false;
let commitStarted=false,saveConfirmed=false,lastActivity=Date.now();
let completionMessage='기기가 Wi-Fi로 화면을 갱신합니다.';
let completionState='기기 화면 갱신 중';
const tabs=['Content','Wifi','Device'];
function message(value,error=false){$('message').textContent=value;$('message').classList.toggle('error',error);}
function saveState(value){$('saveState').textContent=value;}
function setBusy(value){
  working=value;$('connect').disabled=value||!!link||!window.isSecureContext||!navigator.bluetooth;
  $('fields').disabled=value||!link;$('save').disabled=value||!link;
}
function activity(){lastActivity=Date.now();}
function markDirty(){if(loaded){dirty=true;saveState('수정한 내용이 있어요 · 저장해 주세요');}activity();}
function selectTab(name,focus=false){
  for(const tab of tabs){const active=tab===name;$('tab'+tab).setAttribute('aria-selected',String(active));$('tab'+tab).tabIndex=active?0:-1;$('panel'+tab).hidden=!active;}
  if(focus)$('tab'+name).focus();activity();
}
for(const name of tabs)$('tab'+name).onclick=()=>selectTab(name);
document.querySelector('.tabs').addEventListener('keydown',event=>{
  const index=tabs.findIndex(name=>$('tab'+name)===event.target);if(index<0)return;
  let next=index;if(event.key==='ArrowRight')next=(index+1)%3;else if(event.key==='ArrowLeft')next=(index+2)%3;
  else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;
  event.preventDefault();selectTab(tabs[next],true);
});
function emptyDashboard(){return {version:1,dday:{title:'',date:''},notes:['',''],important:Array.from({length:3},()=>({title:'',date:''}))};}
function collectDashboard(){return {version:1,dday:{title:$('ddayTitle').value.trim(),date:$('ddayDate').value},notes:[0,1].map(i=>$('note'+i).value.replaceAll('\r\n','\n')),important:[0,1,2].map(i=>({title:$('important'+i+'Title').value.trim(),date:$('important'+i+'Date').value}))};}
function fillDashboard(d){
  $('ddayTitle').value=d.dday?.title||'';$('ddayDate').value=d.dday?.date||'';
  for(let i=0;i<2;i++)$('note'+i).value=d.notes?.[i]||'';
  for(let i=0;i<3;i++){$('important'+i+'Title').value=d.important?.[i]?.title||'';$('important'+i+'Date').value=d.important?.[i]?.date||'';}
  updateCounters();
}
function updateCounters(){
  const title=$('ddayTitle').value,date=$('ddayDate').value;
  $('ddayPreview').textContent='';
  if(title&&date){
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const days=Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
    if(Number.isFinite(days))$('ddayPreview').textContent=days===0?'D-DAY':days>0?'D-'+days:'D+'+(-days);
  }
  for(let i=0;i<2;i++){
    const parts=$('note'+i).value.split('\n'),lengths=parts.map(part=>[...part].length),bad=parts.length>2||lengths.some(n=>n>22);
    $('note'+i+'Count').textContent=lengths.map(n=>n+' / 22자').join(' · ');
    $('note'+i+'Count').classList.toggle('bad',bad);$('note'+i).setAttribute('aria-invalid',String(bad));
  }
  const n=[...$('memo').value].length,bytes=encoder.encode($('memo').value).length;
  $('counter').textContent=n+' / 200자';$('memo').setAttribute('aria-invalid',String(n>200||bytes>600));
}
function updateMode(){
  const mode=Number(document.querySelector('input[name=mode]:checked').value);
  $('dashboardFields').hidden=mode!==0;$('largeMemoSection').hidden=mode===0;
  $('save').textContent='저장하고 '+['대시보드','큰 메모','시계'][mode]+'로 돌아가기';
}
function blankProfile(){return {ssid:'',savedSsid:'',password:'',hasPassword:false,keep:false,open:false,expanded:true};}
function drawNetworks(){
  const root=$('profiles');root.replaceChildren();$('wifiCount').textContent=profiles.filter(p=>p.ssid).length;
  profiles.forEach((p,index)=>{
    const card=document.createElement('details');card.className='network';card.open=!!p.expanded;
    card.addEventListener('toggle',()=>p.expanded=card.open);
    const summary=document.createElement('summary'),number=document.createElement('span'),copy=document.createElement('span');
    number.className='network-index';number.textContent=String(index+1).padStart(2,'0');copy.className='network-copy';
    const title=document.createElement('b'),sub=document.createElement('small');copy.append(title,sub);summary.append(number,copy);card.append(summary);
    function updateSummary(){
      title.textContent=p.ssid||'새 Wi-Fi';
      sub.textContent=(index===0?'우선 연결 · ':'')+(p.open?'비밀번호 없음':p.password?'새 비밀번호 입력됨':p.keep?'비밀번호 저장됨':'비밀번호 입력 필요');
      $('wifiCount').textContent=profiles.filter(p=>p.ssid).length;
    }
    const body=document.createElement('div');body.className='network-body';
    const ssidLabel=document.createElement('label');ssidLabel.textContent='Wi-Fi 이름';
    const ssid=document.createElement('input');ssid.type='text';ssid.value=p.ssid;ssid.autocomplete='off';ssid.spellcheck=false;ssid.placeholder='Wi-Fi 이름을 정확히 입력';ssid.setAttribute('aria-label','Wi-Fi '+(index+1)+' 이름');
    ssid.oninput=()=>{p.ssid=ssid.value;p.keep=p.ssid===p.savedSsid&&p.hasPassword;password.placeholder=p.keep?'빈칸이면 저장된 비밀번호 유지':'8~63바이트 비밀번호';updateSummary();};
    ssidLabel.append(ssid);body.append(ssidLabel);
    const passLabel=document.createElement('label');passLabel.textContent='비밀번호';const passField=document.createElement('div');passField.className='password-field';
    const password=document.createElement('input');password.type='password';password.autocomplete='new-password';password.value=p.password;password.disabled=p.open;password.placeholder=p.keep?'빈칸이면 저장된 비밀번호 유지':'8~63바이트 비밀번호';password.setAttribute('aria-label','Wi-Fi '+(index+1)+' 비밀번호');
    password.oninput=()=>{p.password=password.value;updateSummary();};
    const show=document.createElement('button');show.type='button';show.className='secondary';show.textContent='보기';show.setAttribute('aria-label','Wi-Fi '+(index+1)+' 비밀번호 보기');show.setAttribute('aria-pressed','false');
    show.onclick=()=>{const visible=password.type==='password';password.type=visible?'text':'password';show.textContent=visible?'숨김':'보기';show.setAttribute('aria-pressed',String(visible));};
    passField.append(password,show);passLabel.append(passField);body.append(passLabel);
    const openLabel=document.createElement('label');openLabel.className='switch';const open=document.createElement('input');open.type='checkbox';open.checked=p.open;
    open.onchange=()=>{p.open=open.checked;password.disabled=p.open;updateSummary();};openLabel.append(open,document.createTextNode('비밀번호 없는 Wi-Fi'));body.append(openLabel);
    const actions=document.createElement('div');actions.className='network-actions';
    if(index){const up=document.createElement('button');up.type='button';up.className='secondary';up.textContent='우선순위 올리기';up.onclick=()=>{[profiles[index-1],profiles[index]]=[profiles[index],profiles[index-1]];markDirty();drawNetworks();};actions.append(up);}
    const remove=document.createElement('button');remove.type='button';remove.className='remove';remove.textContent='삭제';remove.setAttribute('aria-label','Wi-Fi '+(index+1)+' 삭제');remove.onclick=()=>{profiles.splice(index,1);markDirty();drawNetworks();};actions.append(remove);
    body.append(actions);card.append(body);root.append(card);updateSummary();
  });$('addWifi').disabled=profiles.length>=4;
}
function wifiDiagnostics(s){
  $('savedWifiCount').textContent=s.profiles.length+'개 저장됨';
  const result=s.wifiLast;
  if(!result){$('wifiStatus').textContent=s.profiles.length?'기기에 저장되어 있어요. 연결 실패 시 이름·비밀번호와 2.4GHz를 확인하세요.':'Wi-Fi를 추가해 주세요.';return;}
  if(result.failed||result.reason){
    const reason=Number(result.reason),label=[201,210,211,212].includes(reason)?'공유기 검색 실패':[15,202,204].includes(reason)?'인증 실패 · 비밀번호 확인':reason===200?'신호 또는 연결 시간 초과':reason===0?'연결 또는 IP 할당 시간 초과':'연결 실패';
    $('wifiStatus').textContent='마지막 시도: '+label+(reason?' (코드 '+reason+')':'')+'. 저장된 목록은 유지됩니다.';
  }else if(Number.isInteger(result.lastProfile)&&result.lastProfile>=0&&result.lastProfile<s.profiles.length){
    const rssi=Number.isFinite(result.rssi)?' · '+result.rssi+' dBm':'';
    $('wifiStatus').textContent='마지막 연결: '+s.profiles[result.lastProfile].ssid+rssi;
  }else $('wifiStatus').textContent=s.profiles.length?'저장됨 · 설정 종료 후 Wi-Fi 연결을 시도합니다.':'Wi-Fi를 추가해 주세요.';
}
function showSettings(s){
  if(s.version!==1&&s.version!==2)throw Error('설정 페이지와 펌웨어 버전이 맞지 않아요.');
  if(!Array.isArray(s.profiles)||s.profiles.length>4||s.profiles.some(p=>typeof p.ssid!=='string'||typeof p.hasPassword!=='boolean'))throw Error('Wi-Fi 목록을 읽지 못했어요. 다시 연결해 주세요.');
  firmwareVersion=s.version;dashboardConfigured=!!s.dashboardConfigured;
  $('dashboardFields').disabled=s.version<2;$('dashboardHint').hidden=s.version>=2&&s.dashboardConfigured;
  $('dashboardHint').textContent=s.version<2?'대시보드 내용 편집은 v2.0 이상 펌웨어가 필요합니다.':'처음 저장하면 구글 시트 대신 아래 내용을 표시합니다. 빈 항목은 숨겨집니다.';
  fillDashboard(s.dashboard||emptyDashboard());
  const mode=document.querySelector('input[name=mode][value="'+s.mode+'"]');if(!mode)throw Error('화면 모드를 읽지 못했어요.');mode.checked=true;
  for(const id of ['interval','fullInterval','quietStart','quietEnd'])$(id).value=s[id];
  $('partial').checked=!!(s.flags&1);$('quiet').checked=!!(s.flags&2);$('quietHours').hidden=!$('quiet').checked;
  $('memo').value=s.memo||'';profiles=s.profiles.map(p=>({...p,savedSsid:p.ssid,keep:p.hasPassword,password:'',open:!p.hasPassword,expanded:false}));
  wifiDiagnostics(s);if(!profiles.length){profiles.push(blankProfile());selectTab('Wifi');}
  drawNetworks();$('deviceName').textContent=s.name;updateCounters();updateMode();
  dirty=false;loaded=true;saveState('기기에 저장된 값을 불러왔어요');
}
function collect(){return {version:firmwareVersion,dashboard:collectDashboard(),mode:Number(document.querySelector('input[name=mode]:checked').value),interval:Number($('interval').value),fullInterval:Number($('fullInterval').value),flags:($('partial').checked?1:0)|($('quiet').checked?2:0),quietStart:Number($('quietStart').value),quietEnd:Number($('quietEnd').value),memo:$('memo').value.replaceAll('\r\n','\n'),profiles:profiles.map(p=>({ssid:p.ssid,password:p.password,open:p.open,keep:p.keep}))};}
function assertSaved(next,saved){
  for(const key of ['version','mode','interval','fullInterval','flags','quietStart','quietEnd','memo'])if(next[key]!==saved[key])throw Error('저장된 '+key+' 값이 다릅니다. 다시 연결해 확인해 주세요.');
  if(next.profiles.length!==saved.profiles?.length)throw Error('저장된 Wi-Fi 개수가 다릅니다. 다시 확인해 주세요.');
  next.profiles.forEach((p,i)=>{if(p.ssid!==saved.profiles[i].ssid||saved.profiles[i].hasPassword!==!p.open)throw Error('저장된 Wi-Fi 목록이 다릅니다. 다시 확인해 주세요.');});
  if(next.version===2&&(!saved.dashboardConfigured||JSON.stringify(next.dashboard)!==JSON.stringify(validateDashboard(saved.dashboard))))throw Error('저장된 대시보드 내용이 다릅니다. 다시 확인해 주세요.');
}
function clearPasswords(){for(const p of profiles)p.password='';drawNetworks();}
function onDisconnected(event){
  if(event?.target&&event.target!==device)return;
  link=null;$('connectionState').textContent='연결 종료';$('connectionDot').classList.remove('on');$('connect').textContent='다시 연결';setBusy(false);clearPasswords();
  if(expectedDisconnect){message(completionMessage);saveState(completionState);}
  else if(commitStarted&&!saveConfirmed){message('저장 확인 전에 연결이 끊겼어요. 다시 연결해 기기에 저장된 값을 확인해 주세요.',true);saveState('저장 결과 확인 필요');}
  else{message('연결이 끊겼어요. 입력 내용은 유지됩니다. 다시 연결해 주세요. 새로 입력한 비밀번호는 다시 입력해야 합니다.',true);saveState(saveConfirmed?'기기에 저장됨 · 다시 연결 후 화면 적용':'다시 연결 후 저장하세요');}
  expectedDisconnect=false;
}
$('connect').onclick=async()=>{
  if(working||!navigator.bluetooth)return;
  if(dirty&&!confirm('다시 연결하면 기기에 저장된 값으로 입력칸을 바꿉니다. 저장하지 않은 수정을 버릴까요?'))return;
  setBusy(true);expectedDisconnect=false;commitStarted=saveConfirmed=false;activity();
  if(device)device.removeEventListener('gattserverdisconnected',onDisconnected);
  try{
    message('EPD 기기를 선택하세요. PIN 요청이 나오면 전자잉크 화면의 숫자 6자리를 입력하세요.');
    device=await navigator.bluetooth.requestDevice({filters:[{services:[SERVICE]}]});device.addEventListener('gattserverdisconnected',onDisconnected);
    const server=await device.gatt.connect(),service=await server.getPrimaryService(SERVICE);
    const rx=await service.getCharacteristic(RX),tx=await service.getCharacteristic(TX);const activeLink=new BleTransport(rx,tx);link=activeLink;
    const settings=await activeLink.info();if(link!==activeLink)throw Error('불러오는 중 연결이 끊겼어요. 다시 연결해 주세요.');
    showSettings(settings);$('connectionState').textContent='연결됨 · 불러오기 완료';$('connectionDot').classList.add('on');$('connect').textContent='연결됨';message('수정한 뒤 아래 저장 버튼을 눌러 주세요.');
  }catch(error){if(device){device.removeEventListener('gattserverdisconnected',onDisconnected);if(device.gatt.connected)device.gatt.disconnect();}link=null;$('connectionDot').classList.remove('on');$('connectionState').textContent='연결하지 못했어요';$('connect').textContent='다시 연결';message(error.message||'연결하지 못했어요. 다시 시도해 주세요.',true);}
  finally{setBusy(false);}
};
$('addWifi').onclick=()=>{if(profiles.length<4){profiles.push(blankProfile());markDirty();drawNetworks();const last=$('profiles').lastElementChild;last?.querySelector('input')?.focus();}};
$('settings').onsubmit=async event=>{
  event.preventDefault();if(!link||working)return;setBusy(true);commitStarted=saveConfirmed=false;let next;
  try{
    next=collect();if(firmwareVersion>=2)next.dashboard=validateDashboard(next.dashboard);encodeSettings(next);
    if(firmwareVersion>=2&&!dashboardConfigured&&!confirm('처음 저장하면 구글 시트 대신 이 내용으로 대시보드를 표시합니다. 빈 항목은 숨겨집니다. 저장할까요?'))return;
    const activeLink=link;$('transferProgress').hidden=false;$('transferProgress').value=0;
    await activeLink.save(next,(progress,phase)=>{
      $('transferProgress').value=progress;commitStarted=phase==='commit';
      saveState(phase==='commit'?'기기에 저장 중':'전송 중 · '+progress+'%');
    });
    saveState('저장된 값 확인 중');const saved=await activeLink.info();assertSaved(next,saved);
    if(link!==activeLink)throw Error('저장 확인 중 연결이 끊겼어요. 다시 연결해 확인해 주세요.');
    saveConfirmed=true;showSettings(saved);saveState('저장 확인 완료 · 기기 화면으로 돌아가는 중');
    message('설정을 저장하고 다시 불러와 확인했어요. Wi-Fi로 화면을 갱신합니다.');
    completionMessage='저장 확인 완료. 블루투스가 종료됐어요. 기기가 Wi-Fi로 화면을 갱신합니다.';completionState='저장 확인 완료 · Wi-Fi로 화면 갱신 중';expectedDisconnect=true;
    await activeLink.command(5);
  }catch(error){
    expectedDisconnect=false;
    const uncertain=commitStarted&&!saveConfirmed;
    message(uncertain?'저장 확인을 마치지 못했어요. '+error.message+' 다시 연결해 저장된 값을 확인해 주세요.':error.message,true);
    saveState(saveConfirmed?'설정 저장됨 · 화면 적용은 다시 연결 후 시도':uncertain?'저장 결과 확인 필요':'입력 내용을 확인해 주세요');
    if(!commitStarted){if(error.message.includes('Wi-Fi'))selectTab('Wifi');else if(error.message.includes('야간'))selectTab('Device');else selectTab('Content');}
  }finally{$('transferProgress').hidden=true;setBusy(expectedDisconnect&&!!link);activity();}
};
$('refresh').onclick=async()=>{
  if(!link||working||dirty&&!confirm('수정한 내용을 저장하지 않고 기존 설정으로 돌아갈까요?'))return;
  setBusy(true);try{completionMessage='기존 설정으로 화면을 갱신합니다. 블루투스가 종료됐어요.';completionState='기존 설정으로 화면 갱신 중';expectedDisconnect=true;await link.command(5);dirty=false;message('기존 설정으로 기기 화면을 갱신합니다.');}catch(error){expectedDisconnect=false;message(error.message,true);}finally{setBusy(expectedDisconnect&&!!link);}
};
$('format').onclick=async()=>{
  if(!link||working||!confirm('화면 캐시 저장소의 파일을 모두 지웁니다. Wi-Fi와 메모는 유지됩니다. 초기화할까요?'))return;
  setBusy(true);try{await link.command(6,new Uint8Array(),20000);message('화면 캐시가 준비됐어요. 아래 저장 버튼을 눌러 주세요.');}catch(error){message(error.message,true);}finally{setBusy(false);}
};
for(const id of ['quietStart','quietEnd'])for(let h=0;h<24;h++){const o=document.createElement('option');o.value=h;o.textContent=String(h).padStart(2,'0')+':00';$(id).append(o);}
$('quietStart').value='22';$('quietEnd').value='7';$('quiet').onchange=()=>$('quietHours').hidden=!$('quiet').checked;
for(let i=0;i<3;i++){
  const row=document.createElement('div');row.className='date-row';
  const title=document.createElement('input');title.type='text';title.id='important'+i+'Title';title.placeholder=(i+1)+'. 일정 이름';title.setAttribute('aria-label','주요 일정 '+(i+1)+' 이름');
  const date=document.createElement('input');date.type='date';date.id='important'+i+'Date';date.min='2000-01-01';date.max='2099-12-31';date.setAttribute('aria-label','주요 일정 '+(i+1)+' 날짜');row.append(title,date);$('importantItems').append(row);
}
$('settings').addEventListener('input',()=>{markDirty();updateCounters();updateMode();});
$('settings').addEventListener('change',()=>{markDirty();updateMode();});
$('settings').addEventListener('click',activity);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')activity();});
// Keep an actively edited foreground page connected; do not keep a hidden page awake.
setInterval(async()=>{if(!link||working||link.busy||document.visibilityState!=='visible'||Date.now()-lastActivity>90000)return;try{await link.command(7);}catch(error){/* A transport failure is surfaced by the next user operation or disconnect event. */}},25000);
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
if(!window.isSecureContext)message('HTTPS 주소로 열어야 블루투스를 연결할 수 있어요.',true);
else if(!navigator.bluetooth)message('블루투스 설정은 Android Chrome에서 지원합니다. 이 주소를 Chrome에서 직접 열어 주세요.',true);
fillDashboard(emptyDashboard());updateMode();setBusy(false);

