export const wrap=(value,count)=>((value%count)+count)%count;
export const shortestDelta=(from,to,count)=>wrap(to-from+count/2,count)-count/2;
export function scenePair(position,count){
  const base=Math.floor(position);
  return {outgoing:wrap(base,count),incoming:wrap(base+1,count),fraction:position-base};
}
