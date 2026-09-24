export function crc32(bytes){let c=0xffffffff;for(const v of bytes){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export function bundleFrame(black,red,epoch,sleepSeconds){
  if(black.length!==48000||red.length!==48000)throw Error('Frame length mismatch');
  const h=Buffer.alloc(32);h.write('EPD2');h[4]=1;h[5]=0;
  h.writeUInt16LE(800,6);h.writeUInt16LE(480,8);h.writeUInt16LE(32,10);
  h.writeUInt32LE(48000,12);h.writeUInt32LE(epoch,16);
  h.writeUInt32LE(crc32(black),20);h.writeUInt32LE(crc32(red),24);h.writeUInt32LE(sleepSeconds,28);
  return Buffer.concat([h,black,red]);
}
