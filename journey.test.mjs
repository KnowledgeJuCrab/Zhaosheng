import test from 'node:test';
import assert from 'node:assert/strict';
import {wrap,shortestDelta,scenePair} from './public/journey-math.js';
test('chapter nine reaches chapter one in one forward step',()=>{assert.equal(shortestDelta(8,0,9),1);assert.equal(wrap(8+1,9),0);});
test('chapter one reaches chapter nine in one backward step',()=>{assert.equal(shortestDelta(0,8,9),-1);assert.equal(wrap(-1,9),8);});
test('every adjacent chapter uses one step and farther choices use the shortest circular route',()=>{
  for(let i=0;i<9;i++){assert.equal(shortestDelta(i,wrap(i+1,9),9),1);assert.equal(shortestDelta(i,wrap(i-1,9),9),-1);}
  assert.equal(shortestDelta(7,1,9),3);assert.equal(shortestDelta(1,7,9),-3);
});
test('picture transitions join the last and first chapters in either direction',()=>{
  assert.deepEqual(scenePair(8.5,9),{outgoing:8,incoming:0,fraction:.5});
  assert.deepEqual(scenePair(-.5,9),{outgoing:8,incoming:0,fraction:.5});
  assert.deepEqual(scenePair(9,9),{outgoing:0,incoming:1,fraction:0});
});
