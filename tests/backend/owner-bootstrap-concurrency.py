#!/usr/bin/env python3
"""Area13 bounded real independent-session test of the actual SQL in place.

No connection arguments/network/hosted fallback. Enum-shaped Auth fixtures and
injected synthetic claims are NOT native provider JWT/OTP verification. Imports
only guarded Area12 runner infrastructure; never executes its prototype/main.
"""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile

from typing import Any

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('area12_infrastructure', ROOT / 'spikes/012-owner-bootstrap/runner.py')
assert spec is not None and spec.loader is not None
r: Any = importlib.util.module_from_spec(spec)
previous_bytecode = sys.dont_write_bytecode
try:
    sys.dont_write_bytecode = True  # Never create artifacts in staged Area12.
    spec.loader.exec_module(r)
finally:
    sys.dont_write_bytecode = previous_bytecode
r.RESULT = {'checks': [], 'observations': {}, 'serverStopped': False}
r.SESSIONS = []
CANDIDATE = ROOT / 'supabase/migrations/20261106020000_owner_bootstrap.sql'
ORIGINAL_CLASSIFY = r.classify

def classify(text):
    for name in ('owner_bootstrap_denied', 'owner_bootstrap_audit_required', 'fixture_audit_failure'):
        if name in text:
            return name
    return ORIGINAL_CLASSIFY(text)
r.classify = classify


def claims(subject=1, aal='aal2'):
    now = int(r.ok('select floor(extract(epoch from clock_timestamp()))::bigint'))
    return {'sub': r.uid(subject), 'session_id': r.uid(2000 + subject), 'aal': aal,
            'exp': now + 3600, 'amr': [{'method': 'totp', 'timestamp': now}]}


def actor(subject=1, aal='aal2'):
    return 'set local role authenticated; set local request.jwt.claims=' + r.lit(json.dumps(claims(subject, aal))) + '; '


def activate(designation, intent):
    return ('set local statement_timeout=\'15s\'; select shopthie_private.activate_first_owner(' +
            ','.join(map(r.lit, (designation, intent, r.uid(3001)))) + ');')


def run_activate(designation, intent):
    return r.run('begin; set local role fixture_owner; ' + activate(designation, intent) + ' commit;')


def private_state():
    return r.ok("""select jsonb_build_array(
      (select jsonb_agg(c) from shopthie_private.owner_bootstrap_control c),
      (select jsonb_agg(i order by i.id) from shopthie_private.owner_bootstrap_intents i),
      (select jsonb_agg(a order by a.user_id) from shopthie_private.app_accounts a),
      (select jsonb_agg(u order by u.user_id) from shopthie_private.app_user_roles u),
      (select relfilenode from pg_class where oid='shopthie_private.owner_freeze_cutover'::regclass),
      (select count(*) from shopthie_private.owner_freeze_cutover),
      (select jsonb_agg(jsonb_build_array(tgrelid,tgname,tgenabled) order by tgrelid,tgname)
       from pg_trigger where tgname like 'owner_freeze%'),
      (select count(*) from shopthie_private.audit_events));""")


def setup():
    r.ok('''create role fixture_owner nologin nosuperuser bypassrls;
      create role anon nologin; create role authenticated nologin;
      create role service_role nologin; create role supabase_auth_admin nologin;
      create schema auth;
      create type auth.aal_level as enum ('aal1','aal2','aal3');
      create type auth.factor_type as enum ('totp','webauthn','phone');
      create type auth.factor_status as enum ('unverified','verified');
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz,
        banned_until timestamptz,deleted_at timestamptz,
        raw_user_meta_data jsonb not null default '{}',raw_app_meta_data jsonb not null default '{}');
      create table auth.mfa_factors(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
        factor_type auth.factor_type not null default 'totp',status auth.factor_status not null);
      create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
        factor_id uuid,aal auth.aal_level,not_after timestamptz,created_at timestamptz,refreshed_at timestamptz);
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      grant usage on schema auth to fixture_owner,anon,authenticated,supabase_auth_admin;
      grant select,update,trigger,references on auth.users to fixture_owner;
      grant select,update on auth.sessions,auth.mfa_factors to fixture_owner;
      grant execute on function auth.uid(),auth.jwt() to fixture_owner,anon,authenticated;
      grant create on schema public to fixture_owner;
      grant create on database postgres to fixture_owner;''')
    files = sorted(p for p in CANDIDATE.parent.glob('*.sql') if p.name <= CANDIDATE.name)
    if len(files) != 10 or files[-1] != CANDIDATE:
        raise RuntimeError('expected nine prior migrations plus exact candidate in place')
    for file in files:
        result = r.run(file=file)
        if result.returncode:
            raise RuntimeError('actual migration failed: ' + file.name + ': ' + result.stderr)
    r.ok('insert into auth.users(id,email_confirmed_at) values ' + ','.join(
        '(' + r.lit(r.uid(n)) + ',clock_timestamp())' for n in range(1, 12)))
    r.ok("update shopthie_private.app_user_roles set role_id='admin' where user_id=" + r.lit(r.uid(4)), 'fixture_owner')
    r.ok('insert into auth.mfa_factors(id,user_id,status) values ' + ','.join(
        '(' + r.lit(r.uid(1000+n)) + ',' + r.lit(r.uid(n)) + ",'verified')" for n in (1, 4)))
    r.ok('insert into auth.sessions values (' + r.lit(r.uid(2001)) + ',' + r.lit(r.uid(1)) + ',' + r.lit(r.uid(1001)) +
         ",'aal2',clock_timestamp()+interval '1 hour',clock_timestamp()-interval '1 hour',clock_timestamp())")
    r.ok('insert into shopthie_private.profiles(user_id,username) values (' + r.lit(r.uid(3)) + ",'fixture_customer')", 'fixture_owner')
    r.check('ten actual migrations in place; non-superuser BYPASSRLS owner; no selected identity',
        r.ok("select (not rolsuper and rolbypassrls) from pg_roles where rolname='fixture_owner'") == 't'
        and r.ok('select designation is null and completed_at is null from shopthie_private.owner_bootstrap_control') == 't')


def audit_fault(enable):
    if enable:
        r.ok('''create function public.fixture_fail_owner_audit() returns trigger language plpgsql as $$
          begin if new.event_type='owner.bootstrap.activate' then return null; end if; return new; end$$;
          create trigger fixture_fail_owner_audit before insert on shopthie_private.audit_events
          for each row execute function public.fixture_fail_owner_audit();''', 'fixture_owner')
    else:
        r.ok('drop trigger fixture_fail_owner_audit on shopthie_private.audit_events; drop function public.fixture_fail_owner_audit()', 'fixture_owner')


def experiment():
    setup()
    for role in ('anon', 'authenticated', 'service_role'):
        r.check('operator/evidence ACL denies ' + role,
          r.ok('select not has_function_privilege(' + r.lit(role) + ", 'shopthie_private.activate_first_owner(uuid,uuid,uuid)','execute') and not has_function_privilege(" +
               r.lit(role) + ", 'shopthie_private.designate_first_owner(uuid,uuid)','execute') and not has_table_privilege(" +
               r.lit(role) + ", 'shopthie_private.owner_bootstrap_control','select,insert,update,delete,truncate')") == 't')
    designation = r.ok('set statement_timeout=\'15s\'; select shopthie_private.designate_first_owner(' +
                       r.lit(r.uid(1)) + ',' + r.lit(r.uid(3001)) + ')', 'fixture_owner')
    ready = json.loads(r.ok('begin; ' + actor(aal='aal1') + 'select public.shopthie_owner_bootstrap_state(); commit;'))
    r.check('real self state allows designated AAL1 MFA readiness without promotion',
            ready == {'subject': r.uid(1), 'status': 'mfa_required', 'designation': designation})
    consent = json.loads(r.ok('begin; ' + actor() + 'select public.shopthie_owner_bootstrap_consent(' + r.lit(designation) + '); commit;'))
    intent = consent['intent']['id']
    r.check('authenticated actual consent returns minimal DTO and leaves zero Owners',
        set(consent) == {'subject','status','designation','intent'} and consent['status'] == 'consented'
        and set(consent['intent']) == {'id','expiresAt'}
        and r.ok("select count(*)=0 from shopthie_private.app_user_roles where role_id='owner'") == 't')

    audit_fault(True)
    before = private_state()
    failed = run_activate(designation, intent)
    r.check('suppressed installed audit fails closed and rolls back marker/role/tombstone/ALWAYS modes',
            failed.returncode != 0 and 'owner_bootstrap_audit_required' in failed.stderr and private_state() == before)
    audit_fault(False)
    for table, mode in (('app_accounts','row exclusive'), ('app_user_roles','row exclusive'),
                        ('owner_freeze_cutover','access share'), ('owner_bootstrap_control','row exclusive'),
                        ('owner_bootstrap_intents','exclusive'), ('audit_events','share')):
        holder = r.Session('bootstrap_busy_' + table)
        holder.send('begin; set local role fixture_owner; lock table shopthie_private.' + table + ' in ' + mode + " mode; select 'HELD';")
        holder.mark('HELD')
        before = private_state()
        failed = run_activate(designation, intent)
        r.check('NOWAIT busy ' + table + ' atomic denial', failed.returncode != 0
                and 'could not obtain lock' in failed.stderr and private_state() == before)
        holder.send("rollback; select 'RELEASED';")
        holder.mark('RELEASED')
        holder.finish()
    for table, column, value in (('users','id',r.uid(1)),('sessions','id',r.uid(2001)),('mfa_factors','id',r.uid(1001))):
        holder = r.Session('native_busy_' + table)
        holder.send('begin; select id from auth.' + table + ' where ' + column + '=' + r.lit(value) + " for update; select 'HELD';")
        holder.mark('HELD')
        before = private_state()
        failed = run_activate(designation, intent)
        denied_consent = r.run('begin; ' + actor() + 'select public.shopthie_owner_bootstrap_consent(' + r.lit(designation) + '); commit;')
        r.check('native ' + table + ' conflicting lock denies activation and repeated consent NOWAIT',
            failed.returncode != 0 and 'could not obtain lock' in failed.stderr
            and denied_consent.returncode != 0 and 'could not obtain lock' in denied_consent.stderr and private_state() == before)
        holder.send("rollback; select 'RELEASED';")
        holder.mark('RELEASED')
        holder.finish()

    stale_owner = [(iso,r.snapshot('new_owner_' + str(i),iso)) for i,iso in enumerate(('repeatable read','serializable'))]
    stale_customer = [(iso,target,r.snapshot('ordinary_' + str(i),iso))
                      for i,(iso,target) in enumerate((('repeatable read',10),('serializable',11)))]
    marker_before = r.ok("select oid||'|'||relfilenode from pg_class where oid='shopthie_private.owner_freeze_cutover'::regclass").split('|')
    cut = r.Session('real_bootstrap')
    cut.send('begin; set local role fixture_owner; ' + activate(designation,intent) + " select 'ACTIVATED';")
    cut.mark('ACTIVATED')
    # Successfully acquired native SHARE locks must block provider deletion, not
    # merely validate a pre-lock read. Synthetic DELETE is rolled back by failure.
    for table, value in (('users',r.uid(1)),('sessions',r.uid(2001)),('mfa_factors',r.uid(1001))):
        failed = r.run("begin; set local lock_timeout='100ms'; delete from auth." + table + ' where id=' + r.lit(value) + '; commit;')
        r.check('activation-held exact native ' + table + ' SHARE lock blocks concurrent deletion',
                failed.returncode != 0 and 'lock timeout' in failed.stderr)
    queued = r.Session('queued_real_owner')
    queued.send("set role fixture_owner; update shopthie_private.app_accounts set status='suspended' where user_id=" + r.lit(r.uid(1)) + ';')
    r.waiting('queued_real_owner')
    cut.send("commit; select 'COMMITTED';")
    cut.mark('COMMITTED')
    cut.finish()
    marker_after = r.ok("select oid||'|'||relfilenode from pg_class where oid='shopthie_private.owner_freeze_cutover'::regclass").split('|')
    r.check('exact activation commits one Owner/audit with renewed marker storage and four ALWAYS guards',
        marker_before[0] == marker_after[0] and marker_before[1] != marker_after[1]
        and r.ok("select (select count(*)=1 from shopthie_private.app_user_roles where role_id='owner') and (select count(*)=4 and bool_and(tgenabled='A') from pg_trigger where tgname like 'owner_freeze%') and (select count(*)=1 from shopthie_private.audit_events where event_type='owner.bootstrap.activate' and actor_id is null)") == 't')
    r.check('consumed exact activation replay rejected', 'owner_bootstrap_denied' in run_activate(designation,intent).stderr)
    for iso, session in stale_owner:
        session.send("set local role fixture_owner; update shopthie_private.app_accounts set status='suspended' where user_id=" + r.lit(r.uid(1)) + ';')
        text = session.finish()
        r.check('old ' + iso + ' Owner mutation hits renewed marker barrier', session.p.returncode != 0 and 'owner_freeze_cutover_not_visible' in text)
    text = queued.finish()
    r.check('queued READ COMMITTED Owner mutation denied after activation', queued.p.returncode != 0 and 'owner_frozen' in text)
    for iso,target,session in stale_customer:
        session.send('\\set ON_ERROR_STOP off\n' + r.rpc(target=target) + '\n\\set ON_ERROR_STOP on\nrollback; begin isolation level ' + iso + '; ' + r.rpc(target=target) + " commit; select 'RETRIED';")
        session.mark('RETRIED')
        text = session.finish()
        persisted = r.ok("select a.status||'|'||a.status_revision||'|'||(select count(*) from shopthie_private.audit_events e where e.target_id=a.user_id and e.event_type='customer.status.change') from shopthie_private.app_accounts a where a.user_id=" + r.lit(r.uid(target)))
        r.check('stale ordinary Customer denial then same-session actual RPC retry ' + iso,
                session.p.returncode == 0 and 'owner_freeze_cutover_not_visible' in text and persisted == 'suspended|1|1')
    for iso in ('read committed','repeatable read','serializable'):
        result = r.run('begin isolation level ' + iso + '; ' + r.rpc() + ' rollback;')
        r.check('fresh actual ordinary Customer status RPC ' + iso, result.returncode == 0 and result.stdout.strip() == 't')
    r.RESULT['observations'].update({'sourceMigrationCount':10,'nativeProviderProof':False,
      'claims':'synthetic injected JWT claims, not signed/verified JWTs or authenticator verification',
      'nativeVersion':'PostgreSQL 17.11 catalog preflight supplied by contract; not executed here',
      'applicationSqlCopied':False,'hostedConnection':False})


def main():
    if len(sys.argv) != 1:
        raise SystemExit('No arguments supported; local synthetic fixture only')
    temporary = None
    cleanup_armed = False
    experiment_completed = False
    try:
        r.provenance()  # System trust signatures AND installed runtime comparison before execution.
        temporary = tempfile.TemporaryDirectory(prefix='area13-owner-',dir=r.SCRATCH,delete=False)
        with temporary as temp:
            base = Path(temp)
            data = base / 'data'
            r.SOCKET = base / 'socket'
            r.SOCKET.mkdir(mode=0o700)
            try:
                result = r.command([r.binpath('initdb'),'-D',data,'-U','fixture_root','-A','trust','--no-locale','-E','UTF8'])
                if result.returncode:
                    raise RuntimeError('private initdb failed')
                cleanup_armed = True  # Arm before pg_ctl can launch and then fail/time out.
                result = r.command([r.binpath('pg_ctl'),'-D',data,'-l',base/'server.log','-o',
                    '-k ' + str(r.SOCKET) + " -p 57993 -c listen_addresses='' -c unix_socket_permissions=0700",'-w','start'])
                if result.returncode:
                    raise RuntimeError('private start failed')
                r.RESULT['localVersion'] = r.ok('show server_version')
                r.check('private Unix socket mode 0700; TCP disabled', (r.SOCKET.stat().st_mode & 0o777) == 0o700
                  and r.ok("select current_setting('listen_addresses')='' and current_setting('unix_socket_permissions')='0700'") == 't')
                experiment()
                experiment_completed = True
            finally:
                try:
                    for session in r.SESSIONS:
                        if session.p.poll() is None:
                            session.p.kill()
                            session.p.wait(timeout=10)
                finally:
                    if cleanup_armed:
                        stopped = r.command([r.binpath('pg_ctl'),'-D',data,'-m','immediate','-w','stop'])
                        status = r.command([r.binpath('pg_ctl'),'-D',data,'status'])
                        r.RESULT['serverStopped'] = stopped.returncode == 0 and status.returncode == 3 and not (data/'postmaster.pid').exists()
                        if not r.RESULT['serverStopped']:
                            raise RuntimeError('private cluster shutdown unconfirmed')
    except BaseException as error:
        r.RESULT['error'] = type(error).__name__ + ': ' + str(error)
        raise
    finally:
        if temporary is not None:
            if not cleanup_armed or r.RESULT['serverStopped']:
                temporary.cleanup()
            else:
                r.RESULT['retainedScratchDirectory'] = temporary.name
        r.RESULT['passed'] = sum(c['passed'] for c in r.RESULT['checks'])
        r.RESULT['failed'] = sum(not c['passed'] for c in r.RESULT['checks'])
        r.RESULT['checkCount'] = len(r.RESULT['checks'])
        r.RESULT['complete'] = experiment_completed and 'error' not in r.RESULT and r.RESULT['serverStopped']
        print(json.dumps(r.RESULT,indent=2),flush=True)


def lifecycle_regressions():
    """Mocked lifecycle cases; callable on import, never invokes a database."""
    import contextlib
    import io
    import subprocess
    import unittest
    from types import SimpleNamespace
    from unittest.mock import Mock, patch

    class LifecycleTests(unittest.TestCase):
        def exercise(self, kind):
            own_spec = importlib.util.spec_from_file_location('area13_lifecycle_fixture', Path(__file__))
            assert own_spec is not None and own_spec.loader is not None
            module: Any = importlib.util.module_from_spec(own_spec)
            old_bytecode = sys.dont_write_bytecode
            try:
                sys.dont_write_bytecode = True
                own_spec.loader.exec_module(module)
            finally:
                sys.dont_write_bytecode = old_bytecode
            calls = []
            confirmed = kind != 'uncertain'
            if kind == 'client_race':
                process = Mock()
                process.poll.return_value = None
                process.kill.side_effect = ProcessLookupError('synthetic client exit race')
                module.r.SESSIONS.append(SimpleNamespace(p=process))
            with tempfile.TemporaryDirectory(prefix='area13-lifecycle-', dir=module.r.SCRATCH) as root:
                module.r.SCRATCH = Path(root) / 'scratch'
                module.r.SCRATCH.mkdir()

                def command(args, **kwargs):
                    action = str(args[-1])
                    calls.append(action)
                    if action == 'start':
                        if kind == 'timeout':
                            raise subprocess.TimeoutExpired('synthetic pg_ctl', 40)
                        if kind != 'interrupt':
                            return subprocess.CompletedProcess(args, 1, '', '')
                    return subprocess.CompletedProcess(args, (3 if confirmed else 0) if action == 'status'
                        else (1 if action == 'stop' and not confirmed else 0), '', '')

                with patch.object(module.r, 'provenance'), patch.object(module.r, 'command', side_effect=command), \
                     patch.object(module.r, 'ok', return_value='t'), patch.object(module, 'experiment', side_effect=KeyboardInterrupt()), \
                     patch.object(sys, 'argv', ['owner-bootstrap-concurrency.py']), contextlib.redirect_stdout(io.StringIO()):
                    with self.assertRaises((RuntimeError,subprocess.TimeoutExpired,ProcessLookupError,KeyboardInterrupt)):
                        module.main()
                self.assertIn('stop', calls)
                self.assertIn('status', calls)
                self.assertEqual(module.r.RESULT['serverStopped'],confirmed)
                self.assertFalse(module.r.RESULT['complete'])
                if kind == 'interrupt':
                    self.assertIn('KeyboardInterrupt',module.r.RESULT['error'])
                if confirmed:
                    self.assertEqual(list(module.r.SCRATCH.iterdir()),[])
                else:
                    retained = Path(module.r.RESULT['retainedScratchDirectory'])
                    self.assertTrue(retained.is_dir() and retained.parent == module.r.SCRATCH)

        def test_failed_start(self): self.exercise('failed_start')
        def test_start_timeout(self): self.exercise('timeout')
        def test_client_cleanup_cannot_skip_shutdown(self): self.exercise('client_race')
        def test_uncertain_shutdown_retains_data(self): self.exercise('uncertain')
        def test_interrupt_is_incomplete_and_reraised(self): self.exercise('interrupt')

    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(LifecycleTests))
    if not result.wasSuccessful():
        raise AssertionError('Area13 lifecycle regressions failed')
    return result.testsRun


if __name__ == '__main__':
    main()
