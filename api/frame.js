import {timingSafeEqual} from 'node:crypto';
import {loadDashboard} from '../lib/epaper/data.mjs';
import {readBattery,queryInt,seoulTime,seoulDate} from '../lib/epaper/model.mjs';
import {renderDashboard,previewEpaper} from '../lib/epaper/render.mjs';
import {bundleFrame} from '../lib/epaper/protocol.mjs';

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const method=req.method||'GET';
  if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
  const token=process.env.FRAME_API_TOKEN;
  if(token){const wanted=Buffer.from('Bearer '+token),got=Buffer.from(String(req.headers?.authorization||''));if(wanted.length!==got.length||!timingSafeEqual(wanted,got))return res.status(401).json({error:'Unauthorized'});}
  let q;
  try{
    if(method==='POST'){
      if(!String(req.headers?.['content-type']||'').toLowerCase().startsWith('application/json'))return res.status(415).json({error:'JSON required'});
      const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body??{});
      if(Buffer.byteLength(raw)>4096)return res.status(413).json({error:'Request too large'});
      q=JSON.parse(raw);if(!q||typeof q!=='object'||Array.isArray(q))throw Error('Invalid body');
    }else q=req.query||{};
  }catch{return res.status(400).json({error:'Invalid JSON'});}
  if(q.layer!==undefined&&!['black','red'].includes(q.layer))return res.status(400).json({error:'Invalid layer'});
  if(q.format!==undefined&&q.format!=='bundle')return res.status(400).json({error:'Invalid format'});
  const mode=q.mode??'dashboard';if(!['dashboard','memo','clock'].includes(mode))return res.status(400).json({error:'Invalid mode'});
  const memo=q.memo??'';
  if(typeof memo!=='string'||Buffer.byteLength(memo)>600||[...memo].length>200||/[\x00-\x09\x0b-\x1f\x7f]/.test(memo))return res.status(400).json({error:'Invalid memo'});
  // Personal notes are POST-only so they do not appear in request URLs.
  if(method==='GET'&&memo)return res.status(400).json({error:'Use POST for memo'});
  try{
    const generatedAt=new Date();
    const data=mode==='dashboard'?await loadDashboard():{calendar:{date:seoulDate(generatedAt)},summary:'자료 정상',marketLabel:''};
    if(data.allFailed)return res.status(503).json({error:'Data temporarily unavailable'});
    const sleepSeconds=queryInt({...q,sleep_s:String(q.sleep_s??300)},'sleep_s',300,3600,300);
    const status={generated:seoulTime(generatedAt),summary:data.summary,market:data.marketLabel,intervalMinutes:Math.round(sleepSeconds/60)};
    const frame=await renderDashboard(data,readBattery(q),status,{mode,memo});
    let output,type;
    if(q.format==='bundle'){output=bundleFrame(frame.black,frame.red,Math.floor(generatedAt.getTime()/1000),sleepSeconds);type='application/octet-stream';}
    else if(q.layer){output=q.layer==='red'?frame.red:frame.black;type='application/octet-stream';}
    else{output=q.preview==='epaper'?await previewEpaper(frame.portrait):frame.portrait;type='image/png';}
    res.setHeader('Content-Type',type);res.setHeader('Content-Length',output.length);res.setHeader('X-Frame-Protocol','EPD2');res.setHeader('X-Frame-Generated-At',generatedAt.toISOString());
    return res.status(200).send(output);
  }catch(error){console.error('Frame generation failed:',error.name);return res.status(500).json({error:'Frame generation failed'});}
}
