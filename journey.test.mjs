import test from 'node:test';
import assert from 'node:assert/strict';
import {wrap,shortestDelta,scenePair,nearestChapter,picturePosition} from './public/journey-math.js';
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
test('clicking a partial picture aligns the nearest complete chapter, including the circular seam',()=>{
  for(const position of [.3,.7,4.49,4.51,8.3,8.7,-.3,-.7,17.7]){
    const target=position+shortestDelta(position,nearestChapter(position,9),9);
    assert.ok(Math.abs(target-Math.round(target))<1e-12);
    assert.ok(Math.abs(target-position)<=.5+1e-12);
    assert.equal(scenePair(Math.round(target),9).fraction,0);
  }
  assert.equal(nearestChapter(8.7,9),0);assert.equal(nearestChapter(-.7,9),8);
});
test('whole-pixel scroll rounding renders a complete picture without skipping real transitions',()=>{
  assert.equal(picturePosition(3.0008,844),3);
  assert.equal(picturePosition(2.9992,844),3);
  assert.equal(picturePosition(8.9995,844),9);
  assert.equal(picturePosition(3.4,844),3.4);
});
