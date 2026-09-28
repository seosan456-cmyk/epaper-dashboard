import {makeDashboardSvg} from './layout.mjs';
import {getDateInfo} from './model.mjs';
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const t=(x,y,value,size=16,weight=600,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" ${extra}>${esc(value)}</text>`;
function linesFor(value,width,size,fit){
  const lines=[];
  for(let paragraph of value.split('\n')){
    if(!paragraph){lines.push('');continue;}
    while(paragraph){const fitted=fit(paragraph,width,size,600);if(fitted===paragraph){lines.push(paragraph);break;}
      const part=fitted.endsWith('…')?fitted.slice(0,-1):fitted;
      if(!part){lines.push('…');break;}lines.push(part);paragraph=paragraph.slice(part.length).trimStart();
    }
  }return lines;
}
export function makeViewSvg(data,battery,status,fit,options={}){
  const mode=options.mode||'dashboard',memo=options.memo||'';
  if(mode==='dashboard'){
    const calendar=memo?{...data.calendar,todos:[{title:memo.replaceAll('\n',' · ')},...(data.calendar.todos||[])]}:data.calendar;
    return makeDashboardSvg(calendar,data.weather,data.market,battery,status,fit);
  }
  const date=getDateInfo(data.calendar.date);
  const label=mode==='memo'?'MEMO':'DAY & TIME';
  let content='';
  if(mode==='memo'){
    const size=[...memo].length>120?22:26;const lineHeight=size+12;
    const maxLines=Math.floor(540/lineHeight);
    const lines=linesFor(memo||'휴대폰에서 메모를 입력해 주세요.',432,size,fit);
    content=t(24,116,'기억해 둘 것들',32,800);
    content+=lines.slice(0,maxLines).map((s,i)=>t(24,180+i*lineHeight,s,size)).join('');
    if(lines.length>maxLines)content+=t(456,737,'이하 내용 생략 · 휴대폰에서 확인',11,600,'text-anchor="end"');
  }else{
    content=t(240,192,`${date.year}년 ${date.month}월 ${date.day}일`,25,700,'text-anchor="middle"')
      +t(240,329,status.generated,116,800,'text-anchor="middle"')
      +t(240,398,date.weekday,32,700,'text-anchor="middle"')
      +t(240,447,`${status.intervalMinutes}분 간격으로 갱신되는 시계`,13,600,'text-anchor="middle"');
    if(memo){content+='<path d="M72 522.5H408" stroke="#000"/>';
      content+=linesFor(memo,336,20,fit).slice(0,5).map((s,i)=>t(240,565+i*31,s,20,600,'text-anchor="middle"')).join('');}
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="800" viewBox="0 0 480 800"><rect width="480" height="800" fill="#fff"/><g font-family="Pretendard" fill="#000">
  <path d="M24 36H42" stroke="#c00000" stroke-width="3"/>${t(54,40,label,12,800)}
  ${t(456,40,`${date.month}.${date.day} ${date.weekday}`,13,600,'text-anchor="end"')}
  ${content}<path d="M24 763.5H456" stroke="#000"/>
  ${t(24,786,`생성 ${status.generated}`,11)}${t(170,786,`약 ${status.intervalMinutes}분 뒤 갱신`,11)}${t(456,786,`배터리 ${battery.label}`,11,600,'text-anchor="end"')}
  </g></svg>`;
}
