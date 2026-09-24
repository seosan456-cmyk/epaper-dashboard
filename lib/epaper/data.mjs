import { CONFIG } from './config.mjs';
import { finite, normalizeCalendar, seoulDate, seoulTime } from './model.mjs';
// Warm-instance cache only. A cold Vercel instance may have no previous value.
const cache = new Map(), pending = new Map();
async function cached(key,ttl,maxStale,loader) {
  const prior=cache.get(key),now=Date.now();
  if(prior && now-prior.at<ttl)return {...prior,stale:false};
  if(pending.has(key))return pending.get(key);
  const job=(async()=>{try{const value=await loader();const item={value,at:Date.now()};cache.set(key,item);return {...item,stale:false};}
    catch(error){if(prior&&Date.now()-prior.at<maxStale)return {...prior,stale:true};throw error;}
    finally{pending.delete(key);}})();
  pending.set(key,job);return job;
}
export async function fetchJson(url) {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),CONFIG.timeoutMs);
  try{const res=await fetch(url,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json'}});
    if(!res.ok)throw Error(`Upstream HTTP ${res.status}`);return await res.json();}
  finally{clearTimeout(timer);}
}
async function coordinates(){
  if(CONFIG.latitude && CONFIG.longitude){const latitude=Number(CONFIG.latitude),longitude=Number(CONFIG.longitude);
    if(!finite(latitude)||!finite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw Error('Invalid coordinates');
    return {latitude,longitude,name:CONFIG.location};}
  return (await cached('geo',86400000,30*86400000,async()=>{
    const d=await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(CONFIG.location)}&count=1&language=ko&countryCode=KR`);
    const p=d.results?.[0];if(!p||!finite(p.latitude)||!finite(p.longitude))throw Error('Location unavailable');return p;
  })).value;
}
function weatherText(c){
  if(!finite(c))return '정보 없음';if(c===0)return '맑음';if([1,2].includes(c))return '구름 조금';if(c===3)return '흐림';
  if([45,48].includes(c))return '안개';if([51,53,55,56,57].includes(c))return '이슬비';if([61,63,65,66,67].includes(c))return '비';
  if([71,73,75,77,85,86].includes(c))return '눈';if([80,81,82].includes(c))return '소나기';if(c>=95)return '뇌우';return '정보 없음';
}
const round=n=>finite(n)?Math.round(n):'--';
const dust=n=>!finite(n)?'정보 없음':n<=15?'좋음':n<=35?'보통':n<=75?'나쁨':'매우 나쁨';
async function weatherParts(){
  const p=await coordinates(),base=`latitude=${p.latitude}&longitude=${p.longitude}&timezone=Asia%2FSeoul`;
  return Promise.allSettled([
    cached('weather:'+seoulDate(),300000,1800000,async()=>{const d=await fetchJson('https://api.open-meteo.com/v1/forecast?'+base+'&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1');
      if(!d.current||!d.daily||!finite(d.current.temperature_2m))throw Error('Weather data missing');
      return {code:finite(d.current.weather_code)?d.current.weather_code:null,condition:weatherText(d.current.weather_code),temp:round(d.current.temperature_2m),
        low:round(d.daily.temperature_2m_min?.[0]),high:round(d.daily.temperature_2m_max?.[0]),rain:round(d.daily.precipitation_probability_max?.[0]),location:p.name};}),
    cached('air',600000,3600000,async()=>{const d=await fetchJson('https://air-quality-api.open-meteo.com/v1/air-quality?'+base+'&current=pm2_5');
      if(!finite(d.current?.pm2_5))throw Error('Air data missing');return dust(d.current.pm2_5);})
  ]);
}
async function chart(symbol,range){
  const d=await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`);
  const r=d.chart?.result?.[0];if(!r)throw Error('Market result missing');
  const points=(r.indicators?.quote?.[0]?.close||[]).filter(finite),price=r.meta?.regularMarketPrice;
  if(!finite(price)||price<=0)throw Error('Market price missing');
  // Never infer a daily change from an arbitrary range-start close.
  const previous=r.meta?.previousClose;
  return {price,change:finite(previous)&&previous>0?price-previous:null,
    rate:finite(previous)&&previous>0?(price-previous)/previous*100:null,points:points.slice(-12),marketTime:r.meta?.regularMarketTime};
}
const value=r=>r.status==='fulfilled'?r.value.value:null;
const warn=r=>r.status==='rejected'||r.value.stale;
export async function loadDashboard(){
  const today=seoulDate();
  // Keep cache bounded over long-lived instances and across date rollover.
  for(const [key,entry] of cache)if(Date.now()-entry.at>30*86400000)cache.delete(key);
  const [calResult,weatherResult,k,u,j]=await Promise.allSettled([
    cached('calendar:'+today,30000,600000,async()=>normalizeCalendar(await fetchJson(CONFIG.calendarUrl),today)),
    weatherParts(),cached('kospi',300000,3600000,()=>chart('^KS11','1mo')),
    cached('usd',900000,3600000,()=>chart('KRW=X','5d')),cached('jpy',900000,3600000,()=>chart('JPYKRW=X','5d'))]);
  const emptyCalendar={date:today,events:[],todos:[],important:[],dday:null,current:false};
  const calendar=value(calResult)||emptyCalendar;
  calendar.available=calResult.status==='fulfilled' && calendar.current;
  const weather={condition:'정보 없음',code:null,temp:'--',low:'--',high:'--',rain:'--',dust:'정보 없음',location:CONFIG.location};
  let weatherWarn=true;
  if(weatherResult.status==='fulfilled'){
    const [w,a]=weatherResult.value;Object.assign(weather,value(w)||{});weather.dust=value(a)||'정보 없음';weatherWarn=warn(w)||warn(a);
  }
  const kp=value(k),usd=value(u),jpy=value(j);
  const market={kospi:kp?{value:kp.price,change:kp.change,rate:kp.rate,points:kp.points}:{value:null,change:null,rate:null,points:[]},usdkrw:usd?.price??null,jpykrw100:jpy?jpy.price*100:null};
  const calendarWarn=warn(calResult)||!calendar.current;
  const problems=[calendarWarn?'일정':null,weatherWarn?'날씨':null,[k,u,j].some(warn)?'금융':null].filter(Boolean);
  // '기준' explicitly refers to source market time; summary identifies stale/failed data.
  const marketDate=kp&&finite(kp.marketTime)?new Date(kp.marketTime*1000):null;
  const marketAt=marketDate&&Number.isFinite(marketDate.getTime())?`${seoulDate(marketDate).slice(5).replace('-','.')} ${seoulTime(marketDate)}`:'시각 미상';
  return {calendar,weather,market,summary:problems.length?`${problems.join('·')} 확인 필요`:'자료 정상',
    marketLabel:kp?`${warn(k)?'이전 ':''}${marketAt} 기준`:'정보 없음',calendarWarn,
    allFailed:calResult.status==='rejected' && (weatherResult.status==='rejected'||weatherResult.value.every(r=>r.status==='rejected')) && [k,u,j].every(r=>r.status==='rejected')};
}
