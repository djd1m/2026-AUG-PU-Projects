#!/usr/bin/env python3
"""Owned local image rollback. Default is read-only resource preflight.

--execute requires sufficient disk; it never prunes shared Docker resources.
Use a fresh --prefix for every attempt. Runtime branches require a future run.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tarfile
import tempfile
import time

ROOT = Path(__file__).resolve().parents[3]
SOURCE = "86d4b0ceedc348f85f3e65de2ebfb272528b1801"
VERSIONS = {
    "current": ("b3df79f3c748c426d7eac16717008ccd121eb10e", "n6b-f15-source-management-web:corrected",
                "sha256:d518d2e9eacfae4b0646aa161253b9edc5a78375b9935b267cdb6d467d220b1e"),
    "previous": ("edf7d770f021831d115d347e1532cea102e1c098", "n6b-f14-handover-web:20261003",
                 "sha256:3ed4f43381dc4acff4d74aba9155c187f89747d626d39f04a9018bd627cbb2d5"),
}
MIGRATE = "n6b-f15-source-management-migrate:corrected"
DB = "pgvector/pgvector:0.8.6-pg16"
MIN_FREE = 6 * 1024**3  # two builds/deps/prune/export plus DB and 512 MiB stop reserve
BUILD_INPUTS = ["Dockerfile", ".dockerignore", "package.json", "package-lock.json", "apps", "services", "packages",
                "tsconfig.json", "tsconfig.base.json", "scripts"]


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def run(args, *, data=None, env=None, timeout=30):
    if env and env.get('DOCKER_BUILDKIT') == '0' and args[:2] == ['docker', 'build']:
        process = subprocess.Popen(args, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
        until = time.monotonic() + timeout
        try:
            while True:
                if shutil.disk_usage(ROOT).free < 512*1024**2:
                    raise RuntimeError('build disk stop reserve reached')
                if time.monotonic() >= until:
                    raise RuntimeError('bounded build timeout')
                try:
                    stdout, stderr = process.communicate(timeout=min(1, until-time.monotonic()))
                    if process.returncode:
                        raise RuntimeError(f'canonical worker build failed: exit {process.returncode}')
                    return stdout + stderr
                except subprocess.TimeoutExpired:
                    pass
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.communicate(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.communicate()
    result = subprocess.run(args, cwd=ROOT, input=data, capture_output=True, env=env, timeout=timeout)
    if result.returncode:
        # Command arguments/output can contain private values: do not echo them.
        raise RuntimeError(f"{args[0]} operation failed: exit {result.returncode}")
    return result.stdout


def image_id(tag):
    try:
        return run(["docker", "image", "inspect", tag, "--format", "{{.Id}}"], timeout=10).decode().strip()
    except RuntimeError:
        return None


def guard(free):
    if free < MIN_FREE:
        raise RuntimeError(f"disk blocker: available={free} bytes; required={MIN_FREE} bytes; shared cleanup forbidden")


def manifest(revision):
    repo = ROOT.parents[1]
    prefix = "projects/06b-rag-class/"
    files = run(["git", "-C", str(repo), "ls-tree", "-r", "--name-only", revision, "--",
                 *[prefix + p for p in BUILD_INPUTS]]).decode().splitlines()
    assert files, "empty source manifest"
    hashes = {}
    for name in files:
        hashes[name[len(prefix):]] = digest(run(["git", "show", revision + ":" + name]))
    return {"revision": revision, "files": hashes,
            "snapshot_sha256": digest(json.dumps(hashes, sort_keys=True).encode())}


def configuration(stack, private, password):
    base = "https://n6b-f16-rollback.invalid"
    shared = {"NODE_ENV": "production", "PUBLIC_BASE_URL": base,
              "OPENROUTER_API_KEY": "synthetic-local-rollback-no-provider-access",
              "SESSION_SECRET": secrets.token_hex(32), "VISITOR_SECRET": secrets.token_hex(32),
              "MIN_SIMILARITY": "0.7", "LIMIT_AUTH_ADDR_HOUR": "10",
              "LIMIT_ANSWER_VISITOR_DAY": "10", "LIMIT_ANSWER_BOT_DAY": "100",
              "LIMIT_ANSWER_GLOBAL_DAY": "1000", "LIMIT_SANDBOX_ACCOUNT_DAY": "100",
              "LIMIT_SANDBOX_GLOBAL_DAY": "2000", "LIMIT_EMBED_TOKENS_ACCOUNT_DAY": "10000",
              "LIMIT_EMBED_TOKENS_GLOBAL_DAY": "100000"}
    shared["DATABASE_URL_SERVICE"] = f"postgresql://n6b_app_service:{password['service']}@db:5432/n6b"
    web = dict(shared, DATABASE_URL_TENANT=f"postgresql://n6b_app_tenant:{password['tenant']}@db:5432/n6b")
    worker = dict(shared, N6B_WORKER_PULSE="/tmp/n6b-worker.pulse")
    logging = {"driver": "json-file", "options": {"max-size": "1m", "max-file": "1"}}
    def service(image, cpus, environment):
        return {"image": image, "cpus": cpus, "environment": environment,
                "networks": ["internal"], "restart": "no", "logging": logging}
    config = {"name": stack, "services": {
        "db": dict(service(DB, .5, {"POSTGRES_DB": "n6b", "POSTGRES_USER": "n6b_owner",
                                     "POSTGRES_PASSWORD": password['owner']}),
                   volumes=["db:/var/lib/postgresql/data"]),
        "migrate": service(MIGRATE, 1.5, {"DATABASE_URL_OWNER": f"postgresql://n6b_owner:{password['owner']}@db:5432/n6b",
            "N6B_DB_TENANT_PASSWORD": password['tenant'], "N6B_DB_SERVICE_PASSWORD": password['service']}),
        "web": service(VERSIONS["current"][1], .75, web),
        "worker": service("n6b-f16-rollback-worker:current", .75, worker)},
        "networks": {"internal": {"internal": True}}, "volumes": {"db": {}}}
    path = private / "compose.json"
    path.write_text(json.dumps(config))
    path.chmod(0o600)
    return config, path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--prefix", default="rollback-1")
    args = parser.parse_args()
    if not args.prefix.startswith("rollback-") or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-" for c in args.prefix):
        parser.error("prefix must be a simple rollback-* name")
    output = ROOT / "tests/artifacts/release-gate" / (args.prefix + "-result.json")
    if output.exists():
        parser.error("result exists: use a fresh attempt prefix")
    started = time.monotonic()
    deadline = started + 840  # final 60s of caller's 900s reserved for handoff
    result = {"run_id": "20261003T064351Z-release-gate", "work_unit_id": "release-gate-local-rollback",
              "source_revision": SOURCE, "started_at": utc(), "operations": [], "checks": {},
              "execute_requested": args.execute, "runtime_verdict": "not_executed", "build_revision": None}
    private = Path(tempfile.mkdtemp(prefix="n6b-f16-rollback-"))
    private.chmod(0o700)
    stack = "n6b-f16-rollback-" + secrets.token_hex(4)
    compose = None
    touched = False
    lock = None
    def operation(name, command, **kwargs):
        entry = {"name": name, "started_at": utc()}
        result["operations"].append(entry)
        try:
            value = run(command, timeout=min(kwargs.pop("timeout", 30), max(1, deadline-time.monotonic())), **kwargs)
            entry["exit_code"] = 0
            return value
        except Exception:
            entry["exit_code"] = 1
            raise
        finally:
            entry["finished_at"] = utc()
    try:
        assert run(["git", "rev-parse", "HEAD"]).decode().strip() == SOURCE, "source drift"
        password = {role: secrets.token_hex(24) for role in ["owner", "tenant", "service"]}
        config, path = configuration(stack, private, password)
        compose = ["docker", "compose", "-p", stack, "-f", str(path)]
        normalized = json.loads(operation("compose-config", compose + ["config", "--format", "json"]))
        assert all(not s.get("ports") and s.get("network_mode") != "host" for s in normalized['services'].values())
        assert all(n.get("internal") for n in normalized["networks"].values())
        assert sum(float(normalized['services'][s]['cpus']) for s in ['db', 'web', 'worker']) == 2
        result['checks']['isolation_and_cpu_config'] = "pass; DB=.5 web=.75 worker=.75; migrate+DB=2; no ports"
        operation("port-conflicts", ["bash", str(ROOT.parents[1] / "scripts/check-port-conflicts.sh"), str(path)])
        result["disk"] = {"available_bytes": shutil.disk_usage(ROOT).free, "required_bytes": MIN_FREE,
                          "stop_reserve_bytes": 512*1024**2}
        result["images"] = {"migrate": image_id(MIGRATE), "db": image_id(DB)}
        result["sources"] = {}
        for label, (revision, web_tag, expected) in VERSIONS.items():
            actual = image_id(web_tag)
            assert actual == expected, "accepted web tag has changed"
            result["images"][label] = {"web_tag": web_tag, "web_id": actual,
                "worker_tag": "n6b-f16-rollback-worker:" + label,
                "worker_id": image_id("n6b-f16-rollback-worker:" + label)}
            result["sources"][label] = manifest(revision)
        result["preflight"] = {"status": "blocked", "source_revision": SOURCE,
            "build_revision": None, "environment": stack + "; isolated/no ports/private synthetic config",
            "inputs": "exact tested own N6b F14/F15 Git sources; canonical Dockerfile target worker",
            "command": "python3 tests/artifacts/release-gate/rollback-runner.py --execute --prefix rollback-NEW",
            "expected_effects": "owned images and ephemeral DB/web/worker; no jobs/provider calls",
            "evidence_root": str(output.parent), "external_actions_executed": False, "e2e_claim": None}
        guard(result["disk"]["available_bytes"])
        if not args.execute:
            result["preflight"]["reason"] = "resource guard passed; --execute needed for local runtime actions"
            result["status"] = "prepared"
            return 0
        lock = open("/tmp/codex-heavy-build.lock", "a")
        operation("lock-request", ["true"])
        lock_deadline = min(time.monotonic()+15, deadline)
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= lock_deadline:
                    raise RuntimeError("heavy-operation mutex unavailable within 15s")
                time.sleep(.2)
        result["lock_acquired_at"] = utc()
        for label, (revision, _, _) in VERSIONS.items():
            guard(shutil.disk_usage(ROOT).free)
            context = private / label
            context.mkdir()
            archive = run(["git", "-C", str(ROOT.parents[1]), "archive", revision,
                           *["projects/06b-rag-class/"+p for p in BUILD_INPUTS]])
            with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
                for member in tar:
                    parts = Path(member.name).parts[2:]
                    if not parts:
                        continue
                    member.name = str(Path(*parts))
                    tar.extract(member, context, filter="data")
            tag = result["images"][label]["worker_tag"]
            # Legacy backend enforces CPU flags; default BuildKit does not enforce them.
            env = dict(os.environ, DOCKER_BUILDKIT="0")
            built = operation("build-worker-"+label, ["docker", "build", "--pull=false", "--rm", "--force-rm",
                "--cpu-period=100000", "--cpu-quota=200000", "--target", "worker", "-t", tag, str(context)],
                env=env, timeout=300)
            (output.parent / (args.prefix+"-build-"+label+".txt")).write_bytes(built)
            result["images"][label]["worker_id"] = image_id(tag)
        result["build_revision"] = {k: v["worker_id"] for k, v in result["images"].items() if isinstance(v, dict)}
        assert result["images"]["db"] and result["images"]["migrate"]
        result["preflight"].update(status="ready", build_revision=result["build_revision"])
        touched = True
        operation("start-db", compose+["up", "-d", "--no-build", "--pull", "never", "db"])
        def sql(statement):
            return operation("owner-sql", compose+["exec", "-T", "db", "psql", "-X", "-v", "ON_ERROR_STOP=1",
                "-U", "n6b_owner", "-d", "n6b", "-At"], data=statement.encode()).decode().strip()
        for _ in range(30):
            try:
                sql("SELECT 1;")
                break
            except RuntimeError:
                time.sleep(1)
        else:
            raise RuntimeError("DB readiness timeout")
        operation("migrate", compose+["run", "--rm", "--no-deps", "migrate"], timeout=60)
        account = sql("INSERT INTO account(email,is_test) VALUES('rollback@example.invalid',true) RETURNING id;").splitlines()[0]
        sql(f"INSERT INTO bot(account_id,public_id,name) VALUES('{account}','rollback0001','rollback-sentinel');")
        token = secrets.token_urlsafe(32)
        import hmac
        token_hash = hmac.new(config['services']['web']['environment']['SESSION_SECRET'].encode(), token.encode(), hashlib.sha256).hexdigest()
        sql(f"INSERT INTO session(account_id,token_hash,expires_at) VALUES('{account}','{token_hash}',now()+interval '1 day');")
        snapshot_query = "SELECT row_to_json(a)::text FROM account a ORDER BY id; SELECT row_to_json(b)::text FROM bot b ORDER BY id; SELECT row_to_json(s)::text FROM session s ORDER BY id; SELECT filename FROM schema_migrations ORDER BY filename;"
        snapshot = digest(sql(snapshot_query).encode())
        for label in ['current', 'previous', 'current']:
            if shutil.disk_usage(ROOT).free < 512*1024**2:
                raise RuntimeError("disk stop reserve reached")
            operation("stop-web-worker", compose+["stop", "web", "worker"])
            config['services']['web']['image'] = result['images'][label]['web_tag']
            config['services']['worker']['image'] = result['images'][label]['worker_tag']
            path.write_text(json.dumps(config))
            before = int(sql("SELECT xact_commit FROM pg_stat_database WHERE datname='n6b';"))
            operation("start-worker-"+label, compose+["up", "-d", "--no-deps", "--no-build", "--pull", "never", "worker"])
            time.sleep(7)
            logs = operation("worker-logs", compose+["logs", "--no-color", "worker"]).decode()
            assert "аренда задач" in logs and "не прошёл" not in logs and "упала" not in logs
            assert int(sql("SELECT xact_commit FROM pg_stat_database WHERE datname='n6b';"))-before >= 5, "worker query loop not proven"
            operation("worker-live-pulse", compose+["exec", "-T", "worker", "sh", "-c", "kill -0 1 && test -s /tmp/n6b-worker.pulse"])
            operation("start-web-"+label, compose+["up", "-d", "--no-deps", "--no-build", "--pull", "never", "web"])
            js = """const base='http://127.0.0.1:3000'; const h=await fetch(base+'/api/health'); if(h.status!==200||(await h.json()).data.db!=='ok') throw Error('health'); const c=await fetch(base+'/cabinet',{redirect:'manual',headers:{cookie:'n6b_session='+process.argv[1]}}); if(c.status!==200||!(await c.text()).includes('rollback-sentinel')) throw Error('session/bootstrap'); console.log('health/session/cabinet pass');"""
            for _ in range(20):
                try:
                    operation("web-health-session-bootstrap", compose+["exec", "-T", "web", "node", "--input-type=module", "-e", js, token])
                    break
                except RuntimeError:
                    time.sleep(1)
            else:
                raise RuntimeError("web readiness/session timeout")
            service_logs = operation('service-log-safety', compose+['logs', '--no-color', 'web', 'worker']).decode()
            for value in [*password.values(), token, token_hash,
                          config['services']['web']['environment']['SESSION_SECRET'],
                          config['services']['web']['environment']['VISITOR_SECRET']]:
                assert value not in service_logs, 'private value leaked to service log'
            assert 'не прошёл' not in service_logs and 'Error:' not in service_logs, 'startup/SQL log error'
            assert digest(sql(snapshot_query).encode()) == snapshot, "seed/schema/session preservation failure"
            assert sql("SELECT (SELECT count(*) FROM index_job)+(SELECT count(*) FROM model_call_log);") == '0'
            ids = operation("container-ids", compose+["ps", "-aq"]).decode().splitlines()
            bindings = json.loads(run(["docker", "inspect", *ids]))
            safe = [{"name": c['Name'], "id": c['Id'], "image": c['Image'], "running": c['State']['Running'],
                "cpu": c['HostConfig']['NanoCpus'], "ports": c['HostConfig']['PortBindings'],
                "networks": list(c['NetworkSettings']['Networks'])} for c in bindings]
            for s in ['web','worker']:
                c = next(c for c in safe if c['name'].endswith('-'+s+'-1'))
                assert c['running'] and c['image'] == result['images'][label][s+'_id'] and not c['ports']
            result['operations'].append({"name": "runtime-stage-"+label, "finished_at": utc(), "exit_code": 0,
                "bindings": safe, "seed_schema_session_sha256": snapshot, "jobs": 0, "provider_ledger": 0})
        result.update(status="completed", runtime_verdict="pass")
        return 0
    except Exception as exc:
        result.update(status="blocked" if not touched else "failed", blocker=str(exc))
        if 'preflight' in result:
            result['preflight']['reason'] = str(exc)
        return 75
    finally:
        cleanup_ok = True
        if touched:
            try:
                operation("cleanup-owned-stack", compose+["down", "--volumes", "--remove-orphans"], timeout=30)
                for kind, cmd in [('containers', ['docker','ps','-aq']), ('networks', ['docker','network','ls','-q']),
                                  ('volumes', ['docker','volume','ls','-q'])]:
                    assert not run(cmd+['--filter', 'label=com.docker.compose.project='+stack]).strip(), kind+" remains"
            except Exception:
                cleanup_ok = False
        shutil.rmtree(private)
        if lock:
            fcntl.flock(lock, fcntl.LOCK_UN)
            lock.close()
            result['lock_released_at'] = utc()
        result['cleanup'] = {"owned_stack_started": touched, "resources_removed": cleanup_ok,
                             "private_directory_removed": not private.exists(), "shared_cleanup": False}
        if not cleanup_ok:
            result.update(status="failed", runtime_verdict="failed_cleanup")
        result['finished_at'] = utc()
        result['elapsed_seconds'] = round(time.monotonic()-started, 3)
        output.write_text(json.dumps(result, indent=2)+'\n')
        print(json.dumps({k: result.get(k) for k in ['status','blocker','runtime_verdict','elapsed_seconds']}))


if __name__ == '__main__':
    raise SystemExit(main())
