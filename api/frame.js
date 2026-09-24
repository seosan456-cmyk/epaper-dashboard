import { timingSafeEqual } from 'node:crypto';
import { loadDashboard } from '../lib/epaper/data.mjs';
import { readBattery, queryInt, seoulTime } from '../lib/epaper/model.mjs';
import { renderDashboard, previewEpaper } from '../lib/epaper/render.mjs';
import { bundleFrame } from '../lib/epaper/protocol.mjs';

export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method && req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  const token=process.env.FRAME_API_TOKEN;
  if(token){const wanted=Buffer.from('Bearer '+token),got=Buffer.from(String(req.headers?.authorization||''));
    if(wanted.length!==got.length||!timingSafeEqual(wanted,got))return res.status(401).json({error:'Unauthorized'});}
  const q=req.query||{};
  if(q.layer!==undefined && !['black','red'].includes(q.layer))return res.status(400).json({error:'Invalid layer'});
  if(q.format!==undefined && q.format!=='bundle')return res.status(400).json({error:'Invalid format'});
  try{
    const data=await loadDashboard();
    if(data.allFailed)return res.status(503).json({error:'Data temporarily unavailable'});
    const generatedAt=new Date(),sleepSeconds=queryInt(q,'sleep_s',300,3600,300);
    const status={generated:seoulTime(generatedAt),summary:data.summary,market:data.marketLabel,intervalMinutes:Math.round(sleepSeconds/60)};
    const frame=await renderDashboard(data,readBattery(q),status);
    let output,type;
    if(q.format==='bundle'){output=bundleFrame(frame.black,frame.red,Math.floor(generatedAt.getTime()/1000),sleepSeconds);type='application/octet-stream';}
    else if(q.layer){output=q.layer==='red'?frame.red:frame.black;type='application/octet-stream';}
    else{output=q.preview==='epaper'?await previewEpaper(frame.portrait):frame.portrait;type='image/png';}
    res.setHeader('Content-Type',type);res.setHeader('Content-Length',output.length);
    res.setHeader('X-Frame-Protocol','EPD2');res.setHeader('X-Frame-Generated-At',generatedAt.toISOString());
    return res.status(200).send(output);
  }catch(error){console.error('Frame generation failed:',error.name);return res.status(500).json({error:'Frame generation failed'});}
}