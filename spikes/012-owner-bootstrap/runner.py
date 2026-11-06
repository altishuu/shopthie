#!/usr/bin/env python3
"""NON-DEPLOYABLE fixture-only Area12 experiment. No connection arguments.

Reads exactly nine actual migrations in place; never imports existing tests.
All identities, provider tables and Auth claims below are synthetic. Claims are
injected test evidence, NOT JWT/signature/OTP verification. Requires no network.
"""
import hashlib
import json
import os
from pathlib import Path
import queue
import subprocess
import tarfile
import tempfile
import threading
import time
import uuid

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
INSTALL = Path('/home/ivanadcan35/.hermes/cache/scratch/owner-freeze.kTLr6g')
SCRATCH = Path('/home/ivanadcan35/.hermes/cache/scratch')
PACKAGES = [INSTALL / x for x in (
    'postgresql-18.6-4.1-x86_64_v3.pkg.tar.zst',
    'postgresql-libs-18.6-4.1-x86_64_v3.pkg.tar.zst')]
# Deliberately no PG*, HOME, credentials, service files or libpq environment inheritance.
ENV = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'LC_ALL': 'C',
       'LD_LIBRARY_PATH': str(INSTALL / 'usr/lib'),
       'PGPASSFILE': '/dev/null', 'PGSERVICEFILE': '/dev/null'}
RESULT = {'prototype': 'NON_DEPLOYABLE_FIXTURE_ONLY', 'verdict': 'PARTIAL',
          'hostedVersion': 'not queried; no hosted connection path',
          'serverStopped': False, 'checks': [], 'observations': {}}
SESSIONS = []
DB = 'postgres'
STARTED = False


def check(name, condition, observation=None):
    item = {'name': name, 'passed': bool(condition)}
    if observation is not None:
        item['observation'] = observation
    RESULT['checks'].append(item)
    print(('PASS ' if condition else 'FAIL ') + str(len(RESULT['checks'])).zfill(2) + ' ' + name, flush=True)
    if not condition:
        raise AssertionError(name)


def digest(stream):
    h = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        h.update(chunk)
    return h.digest()


def provenance():
    compared = 0
    required = {'usr/bin/' + x for x in ('postgres', 'psql', 'initdb', 'pg_ctl')}
    observed = set()
    for package in PACKAGES:
        # Use the system trust database, not keys obtained from the package.
        subprocess.run(['pacman-key', '--verify', str(package) + '.sig', str(package)],
                       check=True, capture_output=True, timeout=60)
        # Stream signed archive entries; do not extract source/package snapshots.
        proc = subprocess.Popen(['zstd', '-dc', str(package)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            with tarfile.open(fileobj=proc.stdout, mode='r|') as archive:
                for member in archive:
                    name = member.name.removeprefix('./')
                    if not name.startswith(('usr/bin/', 'usr/lib/', 'usr/share/postgresql/')):
                        continue
                    local = INSTALL / name
                    if member.isreg():
                        with archive.extractfile(member) as signed, local.open('rb') as installed:
                            if digest(signed) != digest(installed):
                                raise RuntimeError('signed runtime file mismatch')
                        compared += 1
                        observed.add(name)
                    elif member.issym():
                        if not local.is_symlink() or os.readlink(local) != member.linkname:
                            raise RuntimeError('signed runtime symlink mismatch')
            proc.stdout.close()
            if proc.wait(timeout=30) != 0:
                raise RuntimeError('signed archive decompression failed')
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
    check('signed packages verified and runtime contents match before execution', required <= observed and compared > 0,
          {'packages': len(PACKAGES), 'regularRuntimeFilesCompared': compared})


def binpath(name):
    return str(INSTALL / 'usr/bin' / name)


def command(args, **kw):
    return subprocess.run([str(x) for x in args], env=ENV, capture_output=True,
                          text=True, timeout=40, **kw)


def psql_args():
    return [binpath('psql'), '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=terse',
            '-h', str(SOCKET), '-p', '57993', '-U', 'fixture_root', '-d', DB]


def run(sql=None, file=None, role=None):
    args = psql_args()
    if file:
        # SET ROLE remains in force across the file's own BEGIN/COMMIT.
        args += ['-c', 'set role fixture_owner', '-f', str(file)]
    elif role:
        sql = 'set role ' + role + '; ' + sql
    return subprocess.run(args, input=sql, env=ENV, capture_output=True, text=True, timeout=25)


def ok(sql, role=None):
    r = run(sql, role=role)
    if r.returncode:
        # Do not persist SQL, identities or raw errors in reports.
        raise RuntimeError('fixture SQL failed: ' + classify(r.stderr))
    return r.stdout.strip()


def classify(text):
    for message in ('owner_freeze_cutover_not_visible', 'owner_frozen',
                    'could not serialize access', 'could not obtain lock',
                    'fixture_approval_denied', 'fixture_binding_denied',
                    'fixture_owner_set_denied', 'fixture_eligibility_denied',
                    'fixture_proof_denied', 'fixture_audit_failure',
                    'profile_support_denied', 'permission denied'):
        if message in text:
            return message
    return 'unexpected local SQL error (raw output suppressed)'


def denied(sql, message, role=None):
    r = run(sql, role=role)
    return r.returncode != 0 and message in r.stderr


def uid(number):
    return str(uuid.UUID(int=number))


def lit(value):
    return 'null' if value is None else "'" + str(value).replace("'", "''") + "'"


def transition(req='boot', target=1, old=None, rotation='truncate'):
    return 'select fixture_cutover.transition(' + ','.join(map(lit, (
        req, uid(target), None if old is None else uid(old), rotation))) + ');'


def approval(req, target=1, old=None, proof_patch=None):
    proof = ("jsonb_build_object('sub'," + lit(uid(target)) + ", 'aal','aal2',"
             "'test_only_verified_for_request'," + lit(req) + ", 'auth_time',extract(epoch from clock_timestamp()))")
    if proof_patch == 'missing':
        proof = 'null'
    elif proof_patch:
        proof += ' || ' + lit(json.dumps(proof_patch)) + '::jsonb'
    ok('insert into fixture_cutover.approvals(request_id,kind,target,old_owner,expires_at,test_only_verified_auth_claims) values (' +
       ','.join([lit(req), lit('bootstrap' if old is None else 'replacement'), lit(uid(target)),
                 lit(None if old is None else uid(old)), "clock_timestamp()+interval '15 minutes'", proof]) + ');', 'fixture_owner')


def actor(number):
    return "set local role authenticated; set local request.jwt.claims=" + lit(json.dumps({'sub': uid(number), 'aal': 'aal2'})) + '; '


def rpc(number=4, target=3):
    return actor(number) + 'select (public.shopthie_customer_status_change(' + lit(uid(target)) + ",'suspended',0,'account_review')->>'status')='suspended'; "


def private_read(number):
    return actor(number) + 'select public.shopthie_profile_support_read(' + lit(uid(3)) + ",'fixture_customer','profile_help') is not null; "


def state():
    return ok("""select jsonb_build_array(
      (select jsonb_agg(jsonb_build_array(a.user_id,a.status,a.status_revision,r.role_id) order by a.user_id)
       from shopthie_private.app_accounts a join shopthie_private.app_user_roles r using(user_id)),
      (select jsonb_agg(jsonb_build_array(oid,relfilenode)) from pg_class where oid='shopthie_private.owner_freeze_cutover'::regclass),
      (select count(*) from shopthie_private.owner_freeze_cutover),
      (select jsonb_agg(jsonb_build_array(tgrelid,tgname,tgenabled) order by tgrelid,tgname)
       from pg_trigger where tgname like 'owner_freeze%'),
      (select jsonb_agg(jsonb_build_array(request_id,consumed) order by request_id) from fixture_cutover.approvals),
      (select count(*) from fixture_cutover.transition_audit));""")


def invariant(owner, previous=None):
    old_clause = 'true' if previous is None else (
        "(select a.status='suspended' and r.role_id='customer' and a.status_revision=1 "
        "from shopthie_private.app_accounts a join shopthie_private.app_user_roles r using(user_id) where a.user_id=" + lit(uid(previous)) + ')')
    return ok("select (select count(*)=1 and min(user_id::text)=" + lit(uid(owner)) +
              " from shopthie_private.app_user_roles where role_id='owner') and " + old_clause +
              " and (select count(*)=4 and bool_and(tgenabled='A') from pg_trigger where tgname like 'owner_freeze%')"
              " and (select count(*)=1 from shopthie_private.owner_freeze_cutover)") == 't'


class Session:
    def __init__(self, name):
        env = dict(ENV, PGAPPNAME='fixture_' + name)
        self.name = name
        self.lines = []
        self.queue = queue.Queue()
        self.p = subprocess.Popen(psql_args(), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, env=env, text=True, bufsize=1)
        SESSIONS.append(self)
        def reader():
            for line in self.p.stdout:
                line = line.strip()
                self.lines.append(line)
                self.queue.put(line)
        threading.Thread(target=reader, daemon=True).start()

    def send(self, sql):
        self.p.stdin.write(sql + '\n')
        self.p.stdin.flush()

    def mark(self, marker):
        end = time.monotonic() + 15
        while time.monotonic() < end:
            try:
                if self.queue.get(timeout=max(.01, end - time.monotonic())) == marker:
                    return
            except queue.Empty:
                break
        raise RuntimeError('session synchronization failed: ' + self.name)

    def finish(self):
        if self.p.poll() is None:
            self.p.stdin.close()
        self.p.wait(timeout=15)
        return '\n'.join(self.lines)


def snapshot(name, isolation):
    s = Session(name)
    s.send('begin isolation level ' + isolation + "; select 1; select 'SNAPSHOT';")
    s.mark('SNAPSHOT')
    return s


def waiting(name):
    for _ in range(200):
        if ok("select coalesce(wait_event_type,'') from pg_stat_activity where application_name=" + lit('fixture_' + name)) == 'Lock':
            return
        time.sleep(.025)
    raise RuntimeError('queued writer did not reach lock wait')


def setup():
    ok("""create schema auth;
    create table auth.users(id uuid primary key, email_confirmed_at timestamptz,
      raw_user_meta_data jsonb not null default '{}',raw_app_meta_data jsonb not null default '{}');
    create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      factor_type text not null default 'totp',status text not null);
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to fixture_owner,anon,authenticated,supabase_auth_admin;
    grant select,update,trigger,references on auth.users to fixture_owner;
    grant select,update on auth.mfa_factors to fixture_owner;
    grant execute on function auth.uid(),auth.jwt() to fixture_owner,anon,authenticated;
    grant create on schema public to fixture_owner;
    grant create on database """ + DB + ' to fixture_owner;')
    files = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
    if len(files) != 9 or files[-1].name != '20261104143127_owner_freeze.sql':
        raise RuntimeError('expected exact nine installed migrations')
    for file in files:
        r = run(file=file)
        if r.returncode:
            raise RuntimeError('runtime migration execution failed: ' + file.name + ': ' + classify(r.stderr))
    if ok("select count(*) from shopthie_private.app_user_roles where role_id='owner'") != '0':
        raise RuntimeError('fixture must start with zero frozen Owners')
    r = run(file=HERE / 'prototype.sql')
    if r.returncode:
        raise RuntimeError('prototype setup failed: ' + classify(r.stderr))
    ok('insert into auth.users(id,email_confirmed_at) values ' + ','.join(
        '(' + lit(uid(n)) + ',clock_timestamp())' for n in range(1, 12)) + ';')
    ok("update shopthie_private.app_user_roles set role_id='admin' where user_id=" + lit(uid(4)) + ';', 'fixture_owner')
    ok('insert into auth.mfa_factors(user_id,status) values ' + ','.join(
        '(' + lit(uid(n)) + ",'verified')" for n in (1, 2, 4, 6, 7, 9)) + ';')
    ok('update auth.users set email_confirmed_at=null where id=' + lit(uid(6)) + ';')
    ok("update shopthie_private.app_accounts set status='suspended' where user_id=" + lit(uid(7)) + ';', 'fixture_owner')
    ok("insert into shopthie_private.profiles(user_id,username) values (" + lit(uid(3)) + ",'fixture_customer');", 'fixture_owner')


def audit_fault(enable):
    if enable:
        ok("""create function fixture_cutover.fail_audit() returns trigger language plpgsql as $$
           begin raise exception 'fixture_audit_failure'; end$$;
           create trigger fixture_fail_audit before insert on fixture_cutover.transition_audit
           for each row execute function fixture_cutover.fail_audit();""", 'fixture_owner')
    else:
        ok('drop trigger fixture_fail_audit on fixture_cutover.transition_audit; drop function fixture_cutover.fail_audit();', 'fixture_owner')


def experiment():
    global DB
    setup()
    check('nine real migrations installed in place under non-superuser BYPASSRLS owner; zero frozen Owners',
          ok("select (not rolsuper and rolbypassrls) from pg_roles where rolname='fixture_owner'") == 't' and
          ok("select count(*) from shopthie_private.app_user_roles where role_id='owner'") == '0' and
          ok("select bool_and(r.rolname='fixture_owner') from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='shopthie_private'") == 't')
    check('direct zero-to-one transition blocked by installed freeze',
          denied("update shopthie_private.app_user_roles set role_id='owner' where user_id=" + lit(uid(1)), 'owner_frozen', 'fixture_owner'))
    check('no application role or PUBLIC can invoke transition or edit approval evidence',
          all(ok("select not has_function_privilege(" + lit(role) + ", 'fixture_cutover.transition(text,uuid,uuid,text)','execute') and not has_table_privilege(" + lit(role) + ", 'fixture_cutover.approvals','insert,update,delete')") == 't'
              for role in ('public', 'anon', 'authenticated', 'service_role')))
    check('missing operator approval denied', denied(transition('absent'), 'fixture_approval_denied', 'fixture_operator'))
    approval('boot')
    check('operator target binding denied', denied(transition('boot', 2), 'fixture_binding_denied', 'fixture_operator'))
    for name, target in (('missing identity', 99), ('unconfirmed email', 6), ('suspended account', 7), ('non-Customer role', 4), ('no current verified TOTP', 8)):
        req = 'eligibility_' + str(target)
        approval(req, target)
        check('eligibility denies ' + name, denied(transition(req, target), 'fixture_eligibility_denied', 'fixture_operator'))
    approval('missing_proof', proof_patch='missing')
    check('missing TEST-only verified proof denied', denied(transition('missing_proof'), 'fixture_proof_denied', 'fixture_operator'))
    approval('aal1', proof_patch={'aal': 'aal1'})
    check('synthetic AAL1 proof denied', denied(transition('aal1'), 'fixture_proof_denied', 'fixture_operator'))
    bound = []
    for req, patch in (('wrong_sub', {'sub': uid(2)}), ('wrong_nonce', {'test_only_verified_for_request': 'other'}), ('stale_proof', {'auth_time': 1})):
        approval(req, proof_patch=patch)
        bound.append(denied(transition(req), 'fixture_proof_denied', 'fixture_operator'))
    check('TEST-only proof subject, request nonce and freshness binding denied', all(bound))

    audit_fault(True)
    before = state()
    check('bootstrap audit failure rolls back marker, memberships, approval and ALWAYS guards',
          denied(transition(), 'fixture_audit_failure', 'fixture_operator') and state() == before)
    audit_fault(False)
    for table, mode in (('app_accounts', 'row exclusive'), ('app_user_roles', 'row exclusive'), ('owner_freeze_cutover', 'access share')):
        holder = Session('busy_' + table)
        holder.send('begin; set local role fixture_owner; lock table shopthie_private.' + table + ' in ' + mode + " mode; select 'HELD';")
        holder.mark('HELD')
        before = state()
        rejected = denied(transition(), 'could not obtain lock', 'fixture_operator')
        check('NOWAIT busy ' + table + ' rolls back completely', rejected and state() == before)
        holder.send("commit; select 'RELEASED';")
        holder.mark('RELEASED')
        holder.finish()

    old_boot = [(iso, snapshot('boot_' + str(i), iso)) for i, iso in enumerate(('repeatable read', 'serializable'))]
    old_customer = [(iso, target, snapshot('customer_' + str(i), iso))
                    for i, (iso, target) in enumerate((('repeatable read', 10), ('serializable', 11)))]
    marker_before = ok("select oid||'|'||relfilenode from pg_class where oid='shopthie_private.owner_freeze_cutover'::regclass").split('|')
    cut = Session('bootstrap_cutover')
    cut.send('begin; set local role fixture_operator; ' + transition() + " select 'CUTOVER_READY';")
    cut.mark('CUTOVER_READY')
    queued = Session('queued_rc_owner')
    queued.send("set role fixture_owner; update shopthie_private.app_accounts set status='suspended' where user_id=" + lit(uid(1)) + ';')
    waiting('queued_rc_owner')
    cut.send("commit; select 'COMMITTED';")
    cut.mark('COMMITTED')
    cut.finish()
    marker_after = ok("select oid||'|'||relfilenode from pg_class where oid='shopthie_private.owner_freeze_cutover'::regclass").split('|')
    check('bootstrap atomically freezes exactly one Owner and audits; same OID renewed marker storage',
          invariant(1) and marker_before[0] == marker_after[0] and marker_before[1] != marker_after[1] and
          ok("select consumed and (select count(*)=1 from fixture_cutover.transition_audit where request_id='boot') from fixture_cutover.approvals where request_id='boot'") == 't')
    check('bootstrap replay rejected', denied(transition(), 'fixture_approval_denied', 'fixture_operator'))
    approval('second_boot', 2)
    check('new bootstrap approval cannot add a second Owner', denied(transition('second_boot', 2), 'fixture_owner_set_denied', 'fixture_operator'))
    for iso, session in old_boot:
        session.send("set local role fixture_owner; update shopthie_private.app_accounts set status='suspended' where user_id=" + lit(uid(1)) + ';')
        text = session.finish()
        check('old ' + iso + ' snapshot bootstrap Owner mutation denied by renewed marker',
              session.p.returncode != 0 and 'owner_freeze_cutover_not_visible' in text)
    text = queued.finish()
    check('queued READ COMMITTED Owner mutation fails after bootstrap commits', queued.p.returncode != 0 and 'owner_frozen' in text)
    for iso, target, session in old_customer:
        session.send('\\set ON_ERROR_STOP off\n' + rpc(target=target) + '\n\\set ON_ERROR_STOP on\nrollback; begin isolation level ' + iso + '; ' + rpc(target=target) + " commit; select 'RETRIED';")
        session.mark('RETRIED')
        text = session.finish()
        persisted = ok("select a.status||'|'||a.status_revision||'|'||(select count(*) from shopthie_private.audit_events e where e.target_id=a.user_id and e.event_type='customer.status.change') from shopthie_private.app_accounts a where a.user_id=" + lit(uid(target)))
        check('stale Customer denied then fresh same-session actual RPC retry ' + iso,
              session.p.returncode == 0 and 'owner_freeze_cutover_not_visible' in text and persisted == 'suspended|1|1')
    for iso in ('read committed', 'repeatable read', 'serializable'):
        r = run('begin isolation level ' + iso + '; ' + rpc() + ' rollback;')
        check('fresh Customer actual status RPC ' + iso, r.returncode == 0 and r.stdout.strip() == 't')

    approval('replace', 2, 1)
    approval('wrong_old', 2, 9)
    approval('self_replace', 1, 1)
    check('replacement exact sole old Owner, caller binding and different target required',
          denied(transition('replace', 2, 9), 'fixture_binding_denied', 'fixture_operator') and
          denied(transition('wrong_old', 2, 9), 'fixture_owner_set_denied', 'fixture_operator') and
          denied(transition('self_replace', 1, 1), 'fixture_owner_set_denied', 'fixture_operator'))
    audit_fault(True)
    before = state()
    check('replacement audit failure restores old Owner access, marker and ALWAYS guards',
          denied(transition('replace', 2, 1), 'fixture_audit_failure', 'fixture_operator') and state() == before)
    audit_fault(False)
    old_replace = [(iso, snapshot('replacement_' + str(i), iso)) for i, iso in enumerate(('repeatable read', 'serializable'))]
    stale_authority = snapshot('replacement_authority', 'repeatable read')
    ok(transition('replace', 2, 1), 'fixture_operator')
    check('replacement atomically promotes target, demotes and suspends old Owner with audit',
          invariant(2, 1) and ok("select count(*) from fixture_cutover.transition_audit where request_id='replace' and kind='replacement'") == '1')
    check('replacement replay rejected', denied(transition('replace', 2, 1), 'fixture_approval_denied', 'fixture_operator'))
    for iso, session in old_replace:
        session.send("set local role fixture_owner; update shopthie_private.app_accounts set status='suspended' where user_id=" + lit(uid(2)) + ';')
        text = session.finish()
        check('old ' + iso + ' snapshot replacement Owner mutation denied by renewed marker',
              session.p.returncode != 0 and 'owner_freeze_cutover_not_visible' in text)
    stale_authority.send(actor(1) + "select 'STALE_PERMISSION='||shopthie_private.has_permission('support.profile.read'); select 'STALE_CONTEXT='||(role='owner' and status='active') from public.shopthie_actor_context(); " + private_read(1))
    text = stale_authority.finish()
    check('replacement stale stable authority remains true but actual locking private read serializes',
          stale_authority.p.returncode != 0 and 'STALE_PERMISSION=true' in text and 'STALE_CONTEXT=true' in text and 'could not serialize access' in text,
          'stable permission/context stale=true; private read denied by changed parent tuple serialization')
    check('fresh replaced old Owner privileged private read denied',
          denied('begin; ' + private_read(1), 'profile_support_denied'))

    loss = snapshot('lost_mfa', 'repeatable read')
    ok('delete from auth.mfa_factors where user_id=' + lit(uid(2)) + ';')
    fresh = run('begin; ' + actor(2) + "select not shopthie_private.has_permission('staff.enter') and not shopthie_private.has_permission('support.profile.read'); rollback;")
    check('fresh synthetic old AAL2 without current verified TOTP denies permissions and private RPC',
          fresh.returncode == 0 and fresh.stdout.strip() == 't' and denied('begin; ' + private_read(2), 'profile_support_denied'))
    loss.send(actor(2) + "select 'STALE_MFA_PERMISSION='||shopthie_private.has_permission('support.profile.read'); " + private_read(2) + " rollback; select 'LOSS_DONE';")
    loss.mark('LOSS_DONE')
    text = loss.finish()
    check('lost-MFA old RR snapshot retains authority AND actual private-read access (limitation)',
          loss.p.returncode == 0 and 'STALE_MFA_PERMISSION=true' in text and 't' in loss.lines,
          'observed stale private-read success; marker rotation is not global factor/JWT revocation')
    ok('insert into auth.mfa_factors(user_id,status) values (' + lit(uid(2)) + ",'verified');")
    renewed = run('begin; ' + private_read(2) + ' rollback;')
    check('TEST-only renewed verified factor plus injected AAL2 restores fresh private read',
          renewed.returncode == 0 and renewed.stdout.strip() == 't', 'not a native recovery or OTP/JWT integration test')

    # One control fixture, same exact nine migrations; no broad matrix.
    ok('create database fixture_control;')
    DB = 'fixture_control'
    setup()
    approval('unsafe_boot')
    stale = snapshot('unsafe_none', 'repeatable read')
    ok(transition('unsafe_boot', rotation='none'), 'fixture_operator')
    stale.send("set local role fixture_owner; update shopthie_private.app_accounts set status='suspended' where user_id=" + lit(uid(1)) + "; select 'BYPASS_OBSERVED'; rollback;")
    text = stale.finish()
    check('unsafe NO marker rotation permits stale bootstrap Owner status mutation',
          stale.p.returncode == 0 and 'BYPASS_OBSERVED' in text and invariant(1),
          'forbidden mutation actually executed in old RR transaction, then deliberately rolled back')
    approval('unsafe_replace', 2, 1)
    stale = snapshot('unsafe_delete', 'repeatable read')
    ok(transition('unsafe_replace', 2, 1, 'delete'), 'fixture_operator')
    stale.send("set local role fixture_owner; update shopthie_private.app_accounts set status='suspended' where user_id=" + lit(uid(2)) + "; select 'BYPASS_OBSERVED'; rollback;")
    text = stale.finish()
    check('unsafe DELETE plus INSERT marker permits stale replacement Owner status mutation',
          stale.p.returncode == 0 and 'BYPASS_OBSERVED' in text and invariant(2, 1),
          'old marker tuple remains visible; forbidden mutation actually executed then rolled back')
    RESULT['observations'].update({
        'safeMarkerRotation': 'old RR/SERIALIZABLE writes rejected; same marker OID, renewed storage',
        'unsafeNoRotation': 'old RR bootstrap Owner status mutation succeeded, test rolled it back',
        'unsafeDeleteInsert': 'old RR replacement Owner status mutation succeeded, test rolled it back',
        'replacementStaleReads': 'plain stable permission/context retain old authority; actual locking private read serializes on suspended parent',
        'lostMfaStaleReads': 'old RR actual private read still succeeds after synthetic factor deletion',
        'freshNoTotp': 'synthetic old AAL2 denied by installed current-factor mandatory checks',
        'productionEvidence': 'unresolved: trusted operator authorization, exact identity designation, native verified target-bound consent/AAL2, provider recovery, JWT/session/draining semantics',
        'migrationExecutions': 18, 'sourceMigrationCountPerFixture': 9,
        'applicationSqlCopied': False, 'nativeProviderActions': False,
        'appAuthorityInstantlyRevokedForEveryInflightSnapshot': False})


def main():
    global SOCKET, STARTED
    # The runner cannot accept a hostname, URL, DSN, credentials, or database switch.
    import sys
    if len(sys.argv) != 1:
        raise SystemExit('No arguments supported; local synthetic fixture only')
    temporary = None
    experiment_completed = False
    try:
        provenance()
        # Delete explicitly only after shutdown is independently confirmed.
        temporary = tempfile.TemporaryDirectory(prefix='area12-owner-', dir=SCRATCH, delete=False)
        with temporary as temp:
            base = Path(temp)
            data = base / 'data'
            SOCKET = base / 'socket'
            SOCKET.mkdir(mode=0o700)
            try:
                r = command([binpath('initdb'), '-D', data, '-U', 'fixture_root', '-A', 'trust', '--no-locale', '-E', 'UTF8'])
                if r.returncode:
                    raise RuntimeError('local initdb failed')
                # Startup may spawn the server before pg_ctl fails or times out.
                # Arm cleanup before the attempt, not only after its success.
                STARTED = True
                r = command([binpath('pg_ctl'), '-D', data, '-l', base / 'server.log', '-o',
                             '-k ' + str(SOCKET) + " -p 57993 -c listen_addresses='' -c unix_socket_permissions=0700", '-w', 'start'])
                if r.returncode:
                    raise RuntimeError('local private cluster start failed')
                RESULT['localVersion'] = ok('show server_version')
                check('private mode-0700 Unix socket and TCP disabled',
                      ok("select current_setting('listen_addresses')='' and current_setting('unix_socket_permissions')='0700'") == 't' and (SOCKET.stat().st_mode & 0o777) == 0o700)
                ok('create role fixture_owner nologin nosuperuser bypassrls; create role fixture_operator nologin nosuperuser nobypassrls; create role anon nologin; create role authenticated nologin; create role service_role nologin; create role supabase_auth_admin nologin;')
                experiment()
                experiment_completed = True
            finally:
                try:
                    for session in SESSIONS:
                        if session.p.poll() is None:
                            session.p.kill()
                            session.p.wait(timeout=10)
                finally:
                    # A client exit/cleanup error must not strand the server.
                    if STARTED:
                        stopped = command([binpath('pg_ctl'), '-D', data, '-m', 'immediate', '-w', 'stop'])
                        status = command([binpath('pg_ctl'), '-D', data, 'status'])
                        RESULT['serverStopped'] = stopped.returncode == 0 and status.returncode == 3 and not (data / 'postmaster.pid').exists()
                        if not RESULT['serverStopped']:
                            raise RuntimeError('local cluster shutdown verification failed')
    except BaseException as error:
        RESULT['error'] = type(error).__name__ + ': ' + str(error)
        raise
    finally:
        if temporary is not None:
            if not STARTED or RESULT['serverStopped']:
                temporary.cleanup()
            else:
                RESULT['retainedScratchDirectory'] = temporary.name
        RESULT['passed'] = sum(c['passed'] for c in RESULT['checks'])
        RESULT['failed'] = sum(not c['passed'] for c in RESULT['checks'])
        RESULT['checkCount'] = len(RESULT['checks'])
        RESULT['complete'] = experiment_completed and 'error' not in RESULT and RESULT['serverStopped']
        (HERE / 'results.json').write_text(json.dumps(RESULT, indent=2) + '\n')
        print(json.dumps({k: RESULT[k] for k in ('checkCount', 'passed', 'failed', 'complete', 'serverStopped', 'verdict')}), flush=True)


if __name__ == '__main__':
    main()
