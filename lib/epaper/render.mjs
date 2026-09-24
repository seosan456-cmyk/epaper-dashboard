import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import { makeDashboardSvg } from './layout.mjs';
import { makeEPaperData, getEPaperColor } from './pixels.mjs';
const files=['Regular','SemiBold','Bold','ExtraBold'].map(w=>path.join(process.cwd(),'fonts',`Pretendard-${w}.otf`));
const font={fontFiles:files,loadSystemFonts:false,defaultFontFamily:'Pretendard',sansSerifFamily:'Pretendard'};
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const widthCache=new Map();
function measure(s,size,weight){
  const key=`${size}/${weight}/${s}`;if(widthCache.has(key))return widthCache.get(key);
  const r=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="10000" height="100"><text x="0" y="60" font-family="Pretendard" font-size="${size}" font-weight="${weight}">${xml(s)}</text></svg>`,{font});
  const box=r.innerBBox();const width=box?Math.max(0,box.x+box.width):0;
  if(widthCache.size>512)widthCache.clear();widthCache.set(key,width);return width;
}
export function fitText(s,max,size,weight){
  s=String(s??'');if(measure(s,size,weight)<=max)return s;
  const chars=[...s];let lo=0,hi=chars.length;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(measure(chars.slice(0,mid).join('')+'…',size,weight)<=max)lo=mid;else hi=mid-1;}
  return chars.slice(0,lo).join('')+'…';
}
export async function renderDashboard(data,battery,status){
  if(files.some(f=>!fs.existsSync(f)))throw Error('Required Pretendard font file missing');
  const svg=makeDashboardSvg(data.calendar,data.weather,data.market,battery,status,fitText);
  const portrait=new Resvg(svg,{background:'#fff',font}).render().asPng();
  const {data:raw,info}=await sharp(portrait).rotate(90).removeAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.width!==800||info.height!==480||info.channels!==3)throw Error('Unexpected frame geometry');
  return {portrait,...makeEPaperData(raw)};
}
export async function previewEpaper(portrait){
  const {data,info}=await sharp(portrait).removeAlpha().raw().toBuffer({resolveWithObject:true});
  if(info.channels!==3)throw Error('Unexpected preview channels');
  const out=Buffer.alloc(data.length,255);
  for(let i=0;i<data.length;i+=3){const color=getEPaperColor(data[i],data[i+1],data[i+2]);if(color===1)out.fill(0,i,i+3);else if(color===2){out[i]=192;out[i+1]=0;out[i+2]=0;}}
  return sharp(out,{raw:{width:info.width,height:info.height,channels:3}}).png().toBuffer();
}
