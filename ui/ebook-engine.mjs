// Native portrait pixels -> clockwise rotated 800x480, MSB-first white=1.
export function ebookPack(rgba){
  if(rgba.length!==480*800*4)throw Error('잘못된 페이지 크기');
  const out=new Uint8Array(48000).fill(255);
  for(let y=0;y<800;y++)for(let x=0;x<480;x++){
    const i=(y*480+x)*4;
    if((rgba[i]*299+rgba[i+1]*587+rgba[i+2]*114)/1000<180){const dx=799-y,dy=x;out[dy*100+(dx>>3)]&=~(128>>(dx&7));}
  }return out;
}
export function ebookRle(bytes){const result=[];for(let i=0;i<bytes.length;){let n=1;while(n<255&&i+n<bytes.length&&bytes[i+n]===bytes[i])n++;result.push(n,bytes[i]);i+=n;}return new Uint8Array(result);}
export function ebookCrc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export function ebookBundle(pages){
  if(!pages.length||pages.length>512)throw Error('한 권은 최대 512페이지입니다.');
  const start=16+pages.length*12,size=start+pages.reduce((n,p)=>n+p.data.length,0);
  if(size>16*1024*1024)throw Error('변환한 책이 16MB를 넘습니다.');
  const out=new Uint8Array(size),v=new DataView(out.buffer);out.set([69,66,75,49]);v.setUint32(4,1,true);v.setUint32(8,pages.length,true);v.setUint32(12,size,true);
  let offset=start;pages.forEach((p,i)=>{v.setUint32(16+i*12,offset,true);v.setUint32(20+i*12,p.data.length,true);v.setUint32(24+i*12,p.crc,true);out.set(p.data,offset);offset+=p.data.length;});return out;
}
export function ebookLines(text,measure){
  text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/\t/g,'    ');
  if(!text.trim())throw Error('책 내용이 비어 있어요.');
  const lines=[];
  for(const paragraph of text.split('\n')){let line='';for(const c of paragraph){if(line&&measure(line+c)>432){lines.push(line);line=c;}else line+=c;}lines.push(line);}
  if(lines.length>512*20)throw Error('최대 512페이지입니다. 글을 나누어 주세요.');return lines;
}
export async function ebookCompile(text,onProgress,preview){
  await document.fonts.load('24px EbookPretendard');
  if(!document.fonts.check('24px EbookPretendard'))throw Error('한글 글꼴을 불러오지 못했어요. 페이지를 새로고침해 주세요.');
  const canvas=document.createElement('canvas');canvas.width=480;canvas.height=800;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.font='400 24px EbookPretendard';
  const lines=ebookLines(text,s=>ctx.measureText(s).width),count=Math.ceil(lines.length/20),pages=[];
  for(let page=0;page<count;page++){
    ctx.fillStyle='#fff';ctx.fillRect(0,0,480,800);ctx.fillStyle='#000';ctx.font='400 24px EbookPretendard';ctx.textBaseline='top';ctx.textAlign='left';
    lines.slice(page*20,page*20+20).forEach((line,i)=>ctx.fillText(line,24,24+i*36));
    ctx.font='400 16px EbookPretendard';ctx.textAlign='center';ctx.fillText(`${page+1} / ${count}`,240,766);
    const image=ctx.getImageData(0,0,480,800),packed=ebookPack(image.data);
    if(page===0&&preview){for(let i=0;i<image.data.length;i+=4){const black=(image.data[i]*299+image.data[i+1]*587+image.data[i+2]*114)/1000<180;image.data[i]=image.data[i+1]=image.data[i+2]=black?0:255;}preview.width=480;preview.height=800;preview.getContext('2d').putImageData(image,0,0);}
    pages.push({data:ebookRle(packed),crc:ebookCrc(packed)});onProgress(page+1,count);await new Promise(r=>setTimeout(r,0));
  }return ebookBundle(pages);
}
