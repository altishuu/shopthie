#!/usr/bin/env python3
"""Independent-session regression for the actual Owner-freeze migration.

Run: python tests/backend/owner-freeze-concurrency.py --pg-bin /path/usr/bin \
  --pg-package /path/postgresql.pkg.tar.zst --libs-package /path/postgresql-libs.pkg.tar.zst
Both local packages require adjacent .sig files trusted by pacman-key. No network.
The supplied binaries and package libraries are compared to signed archives before use.
The test creates only synthetic local auth fixtures and a private Unix-socket cluster.
"""
import argparse
import glob
import hashlib
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / 'supabase/migrations'
CANDIDATE = MIGRATIONS / '20261104143127_owner_freeze.sql'
P = argparse.ArgumentParser()
P.add_argument('--pg-bin', required=True, type=Path)
P.add_argument('--pg-package', required=True, type=Path)
P.add_argument('--libs-package', required=True, type=Path)
a = P.parse_args()
pgbin = a.pg_bin.resolve()
assert pgbin.name == 'bin' and pgbin.parent.name == 'usr', 'expected package-root/usr/bin'
install = pgbin.parent.parent
scratch = os.environ.get('TMPDIR')
if not scratch:
    raise SystemExit('Set TMPDIR to a private scratch directory')
passed = 0
sessions = []
started = False

def check(name, condition, detail=''):
    global passed
    if not condition:
        raise AssertionError(f'{name}: {detail}')
    passed += 1
    print(f'PASS {passed:02d} {name}', flush=True)

def digest(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1024 * 1024), b''): h.update(b)
    return h.digest()

with tempfile.TemporaryDirectory(prefix='owner-freeze-', dir=scratch) as td:
    base = Path(td); signed = base / 'signed'; signed.mkdir()
    # Verify signatures before extracting or executing any PostgreSQL binary.
    for pkg in (a.pg_package.resolve(), a.libs_package.resolve()):
        subprocess.run(['pacman-key', '--verify', str(pkg)+'.sig', str(pkg)], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(['tar', '--zstd', '-xf', str(pkg), '-C', str(signed)], check=True)
    for root in (signed/'usr/bin', signed/'usr/lib', signed/'usr/share/postgresql'):
        if not root.exists(): continue
        for src in root.rglob('*'):
            if src.is_file() and not src.is_symlink():
                dst = install / src.relative_to(signed)
                if not dst.is_file() or digest(src) != digest(dst):
                    raise RuntimeError(f'signed package mismatch: {dst}')
    for name in ('psql', 'postgres', 'initdb', 'pg_ctl'):
        if not (signed/'usr/bin'/name).is_file(): raise RuntimeError('binary not in signed package: '+name)
    check('signed package contents match local PostgreSQL installation', True)
    env = os.environ.copy(); env['LD_LIBRARY_PATH'] = str(install/'usr/lib')
    data = base/'data'; sock = base/'socket'; sock.mkdir(mode=0o700)
    port = '57991'
    def command(args, **kw):
        return subprocess.run([str(x) for x in args], env=env, text=True, capture_output=True, timeout=30, **kw)
    def binary(name): return pgbin/name
    args = [binary('psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', sock, '-p', port, '-d', 'postgres']
    def run(sql=None, file=None, app='control'):
        e=env.copy(); e['PGAPPNAME']=app
        return subprocess.run([str(x) for x in args]+(['-f', str(file)] if file else []), input=sql, text=True, capture_output=True, env=e, timeout=25)
    def ok(sql):
        r=run(sql)
        if r.returncode: raise RuntimeError((sql,r.stderr))
        return r.stdout.strip()
    def reject(name, sql, text='owner_frozen'):
        r=run(sql); check(name, r.returncode != 0 and text in r.stderr, r.stderr)
    class Session:
        def __init__(self, name):
            e=env.copy(); e['PGAPPNAME']=name
            self.name=name; self.q=queue.Queue(); self.lines=[]
            self.p=subprocess.Popen([str(x) for x in args], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, env=e)
            sessions.append(self)
            def reader():
                for line in self.p.stdout:
                    self.lines.append(line.strip()); self.q.put(line.strip())
            threading.Thread(target=reader, daemon=True).start()
        def send(self, sql): self.p.stdin.write(sql+'\n'); self.p.stdin.flush()
        def marker(self, marker):
            deadline=time.monotonic()+15
            while time.monotonic()<deadline:
                try: line=self.q.get(timeout=max(.01,deadline-time.monotonic()))
                except queue.Empty: break
                if line==marker: return
            raise RuntimeError((self.name,marker,self.lines,self.p.poll()))
        def finish(self):
            if self.p.poll() is None: self.p.stdin.close()
            self.p.wait(timeout=15)
    def waiting(name):
        for _ in range(200):
            x=ok("select coalesce(wait_event_type,'') from pg_stat_activity where application_name='"+name+"'")
            if x=='Lock': return
            time.sleep(.05)
        raise RuntimeError('no lock wait: '+name+' '+x)
    owner='00000000-0000-4000-8000-000000000001'
    admin='00000000-0000-4000-8000-000000000002'
    cust='00000000-0000-4000-8000-000000000003'
    other='00000000-0000-4000-8000-000000000004'
    stale_customers=['00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000006']
    def rpc(actor, status, rev, target=cust):
        claims=json.dumps({'sub':actor,'aal':'aal2'})
        return f"set local role authenticated; select set_config('request.jwt.claims','{claims}',true); select public.shopthie_customer_status_change('{target}','{status}',{rev},'account_review');"
    try:
        r=command([binary('initdb'),'-D',data,'-A','trust','--no-locale','-E','UTF8'])
        if r.returncode: raise RuntimeError(r.stderr)
        r=command([binary('pg_ctl'),'-D',data,'-l',base/'server.log','-o',f'-k {sock} -p {port} -c listen_addresses=','-w','start'])
        if r.returncode: raise RuntimeError(r.stderr)
        started=True
        ok("""create role service_role nologin; create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}',raw_app_meta_data jsonb not null default '{}'); create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,factor_type text not null default 'totp',status text not null); create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb$$; create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$; grant usage on schema auth to anon,authenticated,supabase_auth_admin; grant execute on function auth.uid(),auth.jwt() to anon,authenticated; grant insert on auth.users to supabase_auth_admin;""")
        preceding=sorted(p for p in MIGRATIONS.glob('*.sql') if p.name<CANDIDATE.name)
        check('exactly eight preceding migrations', len(preceding)==8, str(preceding))
        for f in preceding:
            r=run(file=f)
            if r.returncode: raise RuntimeError((str(f),r.stderr))
        check('all eight preceding migrations executed directly', True)
        ok("insert into auth.users(id) values "+','.join(f"('{x}')" for x in (owner,admin,cust,other,*stale_customers))+f"; update shopthie_private.app_user_roles set role_id='owner' where user_id='{owner}'; update shopthie_private.app_user_roles set role_id='admin' where user_id='{admin}'; insert into auth.mfa_factors(user_id,status) values ('{owner}','verified'),('{admin}','verified');")
        for table in ('app_accounts','app_user_roles'):
            s=Session('holder_'+table); s.send(f"begin; lock table shopthie_private.{table} in row exclusive mode; select 'HELD';"); s.marker('HELD')
            r=run(file=CANDIDATE)
            check('NOWAIT busy '+table, r.returncode!=0 and 'could not obtain lock' in r.stderr, r.stderr)
            check('no partial cutover '+table, ok("select (to_regclass('shopthie_private.owner_freeze_cutover') is null)::text||'|'||(select count(*) from pg_trigger where tgname like 'owner_freeze%' and not tgisinternal)||'|'||(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='shopthie_private' and p.proname like 'owner_freeze%')")=='true|0|0')
            s.send("commit; select 'RELEASED';");s.marker('RELEASED');s.finish()
        stale=[]
        for name, iso, prepared in [('stale_rr','repeatable read',False),('stale_ser','serializable',False),('stale_plan','repeatable read',True)]:
            s=Session(name); stale.append((s,prepared))
            if prepared:
                s.send(f"prepare old_update as update shopthie_private.app_accounts set status='suspended' where user_id='{owner}'; select 'PREPARED';");s.marker('PREPARED')
            s.send(f"begin isolation level {iso}; select 1; select 'SNAPSHOT';");s.marker('SNAPSHOT')
        stale_customer_sessions=[]
        for number,iso in enumerate(('repeatable read','serializable')):
            s=Session('stale_customer_'+str(number)); stale_customer_sessions.append((s,iso,stale_customers[number]))
            s.send(f"begin isolation level {iso}; select 1; select 'CUSTOMER_SNAPSHOT';"); s.marker('CUSTOMER_SNAPSHOT')
        fresh_plan=Session('fresh_prepared')
        fresh_plan.send(f"prepare fresh_update as update shopthie_private.app_accounts set status='suspended' where user_id='{owner}'; select 'PREPARED';");fresh_plan.marker('PREPARED')
        # TEST-only event trigger gates the real file while its transactional locks are held.
        ok("create function public.owner_freeze_test_gate() returns event_trigger language plpgsql as $$begin if current_setting('application_name')='cutover' and tg_tag='CREATE TRIGGER' then perform pg_advisory_xact_lock(918237); end if; end$$; create event trigger owner_freeze_test_gate on ddl_command_end execute function public.owner_freeze_test_gate();")
        gate=Session('gate');gate.send("begin; select pg_advisory_xact_lock(918237); select 'GATE';");gate.marker('GATE')
        cut=Session('cutover');cut.send('\\i '+str(CANDIDATE)+'\nselect \'CUTOVER_COMMITTED\';');waiting('cutover')
        direct=Session('queued_direct');direct.send(f"update shopthie_private.app_accounts set status='suspended' where user_id='{owner}';");waiting('queued_direct')
        queued=Session('queued_rpc');queued.send('begin; '+rpc(admin,'suspended',0)+" commit; select 'RPC_COMMITTED';");waiting('queued_rpc')
        gate.send("commit; select 'RELEASED';");gate.marker('RELEASED');gate.finish()
        cut.marker('CUTOVER_COMMITTED');cut.finish()
        check('actual migration successful cutover',cut.p.returncode==0 and ok("select count(*) from pg_trigger where tgname like 'owner_freeze%' and not tgisinternal")=='4',str(cut.lines))
        queued.marker('RPC_COMMITTED');queued.finish();check('queued READ COMMITTED actual Admin Customer RPC',queued.p.returncode==0 and any('"status": "suspended"' in l for l in queued.lines),str(queued.lines))
        direct.finish();check('queued READ COMMITTED direct Owner update denied',direct.p.returncode!=0 and any('owner_frozen' in l for l in direct.lines),str(direct.lines))
        for s,prepared in stale:
            s.send(('execute old_update;' if prepared else f"update shopthie_private.app_accounts set status='suspended' where user_id='{owner}';"));s.finish()
            check(s.name+' stale snapshot denied',s.p.returncode!=0 and any('owner_freeze_cutover_not_visible' in l for l in s.lines),str(s.lines))
        fresh_plan.send('execute fresh_update;');fresh_plan.finish()
        check('pre-cutover prepared plan with fresh snapshot denied',fresh_plan.p.returncode!=0 and any('owner_frozen' in l for l in fresh_plan.lines),str(fresh_plan.lines))
        for s,iso,target in stale_customer_sessions:
            # Expected stale-snapshot error must abort the old transaction, not
            # disable Customer mutations in a new transaction at the same level.
            s.send('\\set ON_ERROR_STOP off\n'+rpc(admin,'suspended',0,target)+
                   '\n\\set ON_ERROR_STOP on\nrollback; begin isolation level '+iso+'; '+
                   rpc(admin,'suspended',0,target)+" commit; select 'CUSTOMER_RETRY_COMMITTED';")
            s.marker('CUSTOMER_RETRY_COMMITTED'); s.finish()
            check('stale Customer denied and fresh same-session retry '+iso,
                  s.p.returncode==0 and any('owner_freeze_cutover_not_visible' in line for line in s.lines),str(s.lines))
            check('fresh Customer retry commits exactly one audited transition '+iso,
                  ok(f"select status||'|'||status_revision||'|'||(select count(*) from shopthie_private.audit_events where target_id='{target}') from shopthie_private.app_accounts where user_id='{target}'")=='suspended|1|1')
        ok('drop event trigger owner_freeze_test_gate; drop function public.owner_freeze_test_gate();')
        for name,sql in [
            ('Owner insert',f"insert into shopthie_private.app_user_roles(user_id,role_id) values('{other}','owner')"),
            ('Owner promotion',f"update shopthie_private.app_user_roles set role_id='owner' where user_id='{other}'"),
            ('Owner demotion',f"update shopthie_private.app_user_roles set role_id='customer' where user_id='{owner}'"),
            ('Owner membership delete',f"delete from shopthie_private.app_user_roles where user_id='{owner}'"),
            ('Owner membership no-op',f"update shopthie_private.app_user_roles set role_id=role_id where user_id='{owner}'"),
            ('Owner status change',f"update shopthie_private.app_accounts set status='suspended' where user_id='{owner}'"),
            ('Owner account delete',f"delete from shopthie_private.app_accounts where user_id='{owner}'"),
            ('Owner Auth cascade',f"delete from auth.users where id='{owner}'"),
            ('Owner bulk demotion',f"update shopthie_private.app_user_roles set role_id='customer' where user_id in ('{owner}','{admin}')"),
        ]: reject(name,sql)
        for table in ('app_accounts','app_user_roles'):
            reject(table+' truncate',f'truncate shopthie_private.{table} cascade','owner_freeze_truncate_denied')
        ok(f"update shopthie_private.app_accounts set status=status where user_id='{owner}'; update shopthie_private.app_user_roles set role_id=role_id where user_id='{other}';")
        check('Owner account and Customer membership no-ops allowed',True)
        r=run(f"begin; delete from auth.users where id='{other}'; rollback;")
        check('non-Owner Auth cascade can roll back',r.returncode==0 and ok(f"select count(*) from auth.users where id='{other}'")=='1',r.stderr)
        check('failed Owner mutations left identity and authority unchanged',ok(f"select a.status||'|'||r.role_id||'|'||(select count(*) from auth.users where id='{owner}') from shopthie_private.app_accounts a join shopthie_private.app_user_roles r using(user_id) where a.user_id='{owner}'")=='active|owner|1')
        for role in ('anon','authenticated','service_role'):
            reject(role+' raw protected table access',f"set role {role}; select * from shopthie_private.app_user_roles;",'permission denied')
        for role in ('anon','authenticated'):
            reject(role+' marker access',f"set role {role}; select * from shopthie_private.owner_freeze_cutover;",'permission denied')
        check('trigger function and marker ACL deny PUBLIC and raw roles',ok("select (not has_function_privilege('public','shopthie_private.owner_freeze_guard()','execute') and not has_function_privilege('authenticated','shopthie_private.owner_freeze_guard()','execute') and not has_function_privilege('anon','shopthie_private.owner_freeze_truncate_guard()','execute') and not has_table_privilege('public','shopthie_private.owner_freeze_cutover','select'))::text")=='true')
        # Each positive RPC runs in a real transaction and rolls back, preserving revision 1.
        for actor,name in ((owner,'Owner'),(admin,'Admin')):
            for iso in ('read committed','repeatable read','serializable'):
                r=run(f'begin isolation level {iso}; '+rpc(actor,'active',1)+' rollback;')
                check(name+' actual Customer RPC '+iso,r.returncode==0 and '"status": "active"' in r.stdout,r.stderr)
        check('RPC rollbacks preserve status, revision and audit',ok(f"select status||'|'||status_revision||'|'||(select count(*) from shopthie_private.audit_events where target_id='{cust}') from shopthie_private.app_accounts where user_id='{cust}'")=='suspended|1|1')
        r=run(f"begin; prepare current_plan as update shopthie_private.app_accounts set status='suspended' where user_id='{owner}'; execute current_plan; commit;")
        check('post-cutover prepared Owner plan denied',r.returncode!=0 and 'owner_frozen' in r.stderr,r.stderr)
        # Independently exercise zero-Owner installation in a second database.
        ok('create database zero_owner')
        oldargs=args[:];args[-1]='zero_owner'
        ok("create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}',raw_app_meta_data jsonb not null default '{}'); create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,factor_type text not null default 'totp',status text not null); create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb$$; create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$; grant usage on schema auth to anon,authenticated,supabase_auth_admin; grant execute on function auth.uid(),auth.jwt() to anon,authenticated; grant insert on auth.users to supabase_auth_admin;")
        for f in preceding+[CANDIDATE]:
            r=run(file=f)
            if r.returncode: raise RuntimeError((f,r.stderr))
        ok(f"insert into auth.users(id) values ('{other}');")
        check('zero Owner cutover succeeds',ok("select count(*) from shopthie_private.app_user_roles where role_id='owner'")=='0')
        reject('zero Owner promotion denied',f"update shopthie_private.app_user_roles set role_id='owner' where user_id='{other}'")
        print(f'RESULT {passed} checks passed',flush=True)
    finally:
        for s in sessions:
            if s.p.poll() is None:
                s.p.kill();s.p.wait()
        if started:
            r=command([binary('pg_ctl'),'-D',data,'-m','immediate','-w','stop'])
            print('SERVER STOP',r.returncode,flush=True)
            if r.returncode: raise RuntimeError('server stop failed: '+r.stderr)
