// Device-owned content. Never put these values into the shared calendar cache.
export function validateDashboard(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||input.version!==1)throw Error('Invalid dashboard');
  const clean=(value,max,lines=1)=>{
    if(typeof value!=='string'||/[\x00-\x09\x0b-\x1f\x7f]/.test(value))throw Error('Invalid dashboard text');
    const parts=value.split('\n');
    if(parts.length>lines||parts.some(x=>[...x].length>max))throw Error('Dashboard text too long');
    return value;
  };
  const dated=row=>{
    if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid dated item');
    const title=clean(row.title,24).trim(),date=row.date;
    if(title===''&&date==='')return {title:'',date:''};
    if(!title||typeof date!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(date))throw Error('Title and date required');
    const d=new Date(date+'T00:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)throw Error('Invalid date');
    return {title,date};
  };
  if(!Array.isArray(input.notes)||input.notes.length!==2||!Array.isArray(input.important)||input.important.length!==3)throw Error('Invalid dashboard slots');
  return {version:1,dday:dated(input.dday),notes:input.notes.map(x=>clean(x,13,2)),important:input.important.map(dated)};
}
export function withDashboard(calendar, dashboard, today) {
  return {...calendar,localContent:true,localDate:today,
    dday:dashboard.dday.title?dashboard.dday:null,
    todos:dashboard.notes.map(title=>({title})).filter(x=>x.title.trim()),
    important:dashboard.important.filter(x=>x.title)};
}
