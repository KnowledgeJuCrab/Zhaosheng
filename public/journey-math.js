export const wrap=(value,count)=>((value%count)+count)%count;
export const shortestDelta=(from,to,count)=>wrap(to-from+count/2,count)-count/2;
export const nearestChapter=(position,count)=>wrap(Math.round(position),count);
// Native scrolling ends on whole CSS pixels, which can be a fraction of a chapter.
export const picturePosition=(position,pageStep)=>Math.abs(position-Math.round(position))*pageStep<=1?Math.round(position):position;
export function scenePair(position,count){
  const base=Math.floor(position);
  return {outgoing:wrap(base,count),incoming:wrap(base+1,count),fraction:position-base};
}
