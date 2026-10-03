import test from 'node:test';
import assert from 'node:assert/strict';
import {signIn,signUp,currentUser,signOut,workspace} from '../app/lib/demo-session.ts';
function store(){const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
test('dummy accounts open the correct workspaces and signup survives logout',()=>{
 globalThis.localStorage=store();globalThis.sessionStorage=store();
 assert.equal(workspace(signIn('BHW@DEMO.LOCAL').role),'/bhw');
 assert.equal(workspace(signIn('hospital@demo.local').role),'/hospital');
 const user=signUp('Test Nurse','nurse@demo.local','BHW');assert.deepEqual(currentUser(),user);
 assert.throws(()=>signUp('Other','nurse@demo.local','Doctor'));
 signOut();assert.equal(currentUser(),null);
 assert.equal(signIn('nurse@demo.local').role,'BHW');
 assert.throws(()=>signIn('missing@demo.local'));
});
