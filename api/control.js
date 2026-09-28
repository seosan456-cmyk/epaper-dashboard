import page from '../lib/epaper/control-page.mjs';
export default function handler(req,res){
  if(req.method&&req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).end();}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','bluetooth=(self)');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  return res.status(200).send(page);
}
