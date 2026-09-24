export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const text = value => typeof value === 'string' ? value.trim().slice(0, 400) : '';
export function seoulDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit' }).format(now);
}
export function seoulTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date) : '--:--';
}
export function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
}
export function getDateInfo(value) {
  const d = new Date(value+'T00:00:00Z');
  return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate(),weekday:['일요일','월요일','화요일','수요일','목요일','금요일','토요일'][d.getUTCDay()]};
}
export function daysUntil(from,to) { return (Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000; }
export function makeDday(from,to) { const n=daysUntil(from,to); return n===0?'D-DAY':n>0?`D-${n}`:`D+${Math.abs(n)}`; }
export function formatMonthDay(date) { const [,m,d]=date.split('-');return `${Number(m)}.${Number(d)}`; }
export function formatNumber(n,digits=2) { return finite(n)?n.toLocaleString('ko-KR',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'--'; }
export function formatSigned(n,digits=2) { return finite(n)?`${n>0?'+':''}${n.toFixed(digits)}`:'--'; }
export function normalizeCalendar(input,today) {
  if(!input || typeof input!=='object' || !isDate(input.date)) throw Error('Invalid calendar date');
  const rows = (v) => Array.isArray(v)?v.filter(x=>x && typeof x==='object' && text(x.title)).slice(0,500):[];
  const dated = v => rows(v).filter(x=>isDate(x.date)).map(x=>({title:text(x.title),date:x.date}));
  const current = input.date === today;
  const events = current ? rows(input.events).map(x=>({title:text(x.title),allDay:x.allDay===true,
    start:/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.start)?x.start:'--:--', end:/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x.end)?x.end:''})) : [];
  events.sort((a,b)=>(Number(b.allDay)-Number(a.allDay))||a.start.localeCompare(b.start));
  return {date:today,events,todos:current?rows(input.todos).map(x=>({title:text(x.title)})):[],
    important:dated(input.important),dday:dated([input.dday])[0]||null,current};
}
export function queryInt(q,key,lo,hi,fallback=null) {
  const v=q[key];if(typeof v!=='string'||!/^\d+$/.test(v))return fallback;
  const n=Number(v);return Number.isSafeInteger(n)&&n>=lo&&n<=hi?n:fallback;
}
export function readBattery(q={}) {
  const mv=queryInt(q,'battery_mv',2500,4400);
  if(mv==null)return {label:'--',fill:0,percent:null};
  const raw=queryInt(q,'adc_raw',0,4095), pin=queryInt(q,'adc_mv',0,3600);
  if ((raw!=null&&raw>=4080)||(pin!=null&&pin>=3100)||q.battery_high==='1') return {label:'높음',fill:23,percent:null};
  // Generic approximate resting Li-ion curve; not a calibration of the user's cell.
  const curve=[[3000,0],[3300,5],[3500,10],[3600,20],[3700,35],[3750,45],[3800,55],[3850,65],[3900,75],[4000,80],[4050,85],[4100,90],[4150,95],[4200,100]];
  let p=mv>=4200?100:0;
  for(let i=1;i<curve.length;i++)if(mv<=curve[i][0]){const [a,x]=curve[i-1],[b,y]=curve[i];p=Math.max(0,x+(mv-a)*(y-x)/(b-a));break;}
  p=Math.max(0,Math.min(100,Math.round(p/5)*5));
  return {label:`~${p}%`,fill:Math.round(23*p/100),percent:p};
}
