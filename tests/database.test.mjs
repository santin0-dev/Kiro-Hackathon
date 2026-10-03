import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const schema=await readFile(new URL('../supabase/setup.sql',import.meta.url),'utf8');
test('PostgreSQL schema: saves are versioned, duplicate slots blocked, RLS and SMS idempotency enforced',async()=>{
  const db=new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);");
    await db.exec(schema);
    const initial={id:'DEMO-001',status:'awaiting_review',plan:null};
    let saved=await db.query('select * from public.vitality_save_case($1,$2::jsonb,$3)',[initial.id,JSON.stringify(initial),null]);
    assert.equal(saved.rows[0].version,1);
    const booked={...initial,status:'active',plan:{due:'2026-10-05T01:00:00Z'}};
    saved=await db.query('select * from public.vitality_save_case($1,$2::jsonb,$3)',[initial.id,JSON.stringify(booked),1]);
    assert.equal(saved.rows[0].version,2);
    const stale=await db.query('select * from public.vitality_save_case($1,$2::jsonb,$3)',[initial.id,JSON.stringify(initial),1]);
    assert.equal(stale.rows.length,0);
    await assert.rejects(()=>db.query('select * from public.vitality_save_case($1,$2::jsonb,$3)',['DEMO-002',JSON.stringify({...booked,id:'DEMO-002'}),null]),e=>e.code==='23505');
    await db.query("insert into public.vitality_sms(id,case_id,state) values('same-message','DEMO-001','pending')");
    await assert.rejects(()=>db.query("insert into public.vitality_sms(id,case_id,state) values('same-message','DEMO-001','pending')"),e=>e.code==='23505');
    await db.exec('set role anon');
    await assert.rejects(()=>db.query('select * from public.vitality_cases'),e=>e.code==='42501');
    await assert.rejects(()=>db.query('select * from public.vitality_save_case($1,$2::jsonb,$3)',[initial.id,JSON.stringify(initial),2]),e=>e.code==='42501');
    await db.exec('reset role');
    const bucket=await db.query("select public from storage.buckets where id='vitality-documents'");assert.equal(bucket.rows[0].public,false);
  }finally{await db.close();}
});
