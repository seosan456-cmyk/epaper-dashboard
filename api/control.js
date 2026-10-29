import page from '../lib/epaper/control-page.mjs';
import fs from 'node:fs';
import path from 'node:path';
let cachedPage;
export default function handler(req,res){
  if(req.method&&req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).end();}
  // Embedded font also works when the entire page is fetched through Google relay.
  // No browser request to vercel.app is required on the school's network.
  if(!cachedPage){const font=fs.readFileSync(path.join(process.cwd(),'fonts','Pretendard-Regular.otf')).toString('base64');cachedPage=page.replace('__EBOOK_FONT_BASE64__',()=>font);}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','bluetooth=(self)');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  return res.status(200).send(cachedPage);
}
