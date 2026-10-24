#!/usr/bin/env python3
"""Offline checks for the file-mailbox companion; no real endpoint or credentials."""
from __future__ import annotations
import copy
import datetime as dt
import importlib.util
import io
import json
from pathlib import Path
import ssl
import tempfile
import urllib.error
from unittest import mock
import sys

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("assistant", HERE.parent / "tools" / "sightline-assistant.py")
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
passed = failed = 0


def ok(name: str, condition: bool) -> None:
    global passed, failed
    passed += bool(condition)
    failed += not condition
    if not condition:
        print("FAIL " + name)


def refused(name: str, fn: object) -> None:
    try:
        fn()
        ok(name, False)
    except a.AssistantError:
        ok(name, True)
    except Exception as exc:
        ok(name + ": unexpected " + type(exc).__name__, False)


CONFIG = {"endpoint": "https://ai.example.com/v1/chat/completions", "model": "company-model", "auth": "bearer"}
CONTEXT = {"kind": "sightline-assistant-view", "version": 1, "plan": {"id": "p-synthetic", "revision": 3}, "jira": {"syncedAt": None}, "guide": "Use existing allowed operations", "projectGuide": {"sections": []}}


def request() -> dict:
    return {"kind": "sightline-chat-request", "version": 1, "planId": "p-synthetic", "requestId": "req-synthetic", "conversationId": "conversation-synthetic", "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(), "planRevision": 3, "jiraSyncedAt": None, "contextText": json.dumps(CONTEXT), "messages": [{"role": "user", "content": "Where does logging belong?"}]}


class Response:
    def __init__(self, data: bytes) -> None:
        self.data = data
    def read(self, size: int) -> bytes:
        return self.data[:size]
    def __enter__(self) -> Response:
        return self
    def __exit__(self, *args: object) -> None:
        pass


class Opener:
    def __init__(self, answer: object = None, failure: Exception | None = None, callback: object = None) -> None:
        self.calls = []
        self.answer = answer if answer is not None else {"message": "Is this retrieval diagnostics or logging across services?"}
        self.failure = failure
        self.callback = callback
    def open(self, req: object, timeout: float) -> Response:
        self.calls.append((req, timeout))
        if self.callback:
            self.callback()
        if self.failure:
            raise self.failure
        return Response(json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(self.answer)}}]}).encode())


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    folder = root / "private"
    folder.mkdir()
    config_path = root / "config" / "assistant.json"
    req = request()
    def put_request(value: dict) -> None:
        (folder / a.REQUEST_FILE).write_text(json.dumps(value))
        (folder / a.CONTEXT_FILE).write_text(value["contextText"])
    def clear_response() -> None:
        (folder / a.RESPONSE_FILE).unlink(missing_ok=True)
    put_request(req)
    ok("valid request identity and context", a.read_request(folder) == req and a.checked_context(folder, req) == CONTEXT)
    ok("config defaults use bounded tokens and timeout", a.validate_config(CONFIG)["maxTokens"] == 4096 and a.validate_config(CONFIG)["timeout"] == 60)
    for value in ["http://ai.example.com/v1/chat/completions", "https://user:secret@ai.example.com/v1/chat/completions", "https://ai.example.com/v1/chat/completions#fragment", "https://ai.example.com/v1/chat/completions?api-key=secret", "https://ai.example.com/other", "https://ai.example.com:0/v1/chat/completions", "https://ai.example.com/\nchat/completions"]:
        refused("unsafe endpoint refused", lambda value=value: a.validate_config({**CONFIG, "endpoint": value}))
    for key, value in [("auth", []), ("responseFormat", {}), ("timeout", True), ("timeout", 121), ("model", ""), ("maxTokens", 8193), ("tokenParameter", []), ("token", "secret")]:
        refused("invalid local config refused " + key, lambda key=key,value=value: a.validate_config({**CONFIG, key:value}))
    refused("configuration must be object", lambda: a.validate_config([]))
    tls = next(h for h in a.endpoint_opener(a.validate_config(CONFIG)).handlers if hasattr(h, "_context"))
    ok("TLS certificate verification and TLS1.2 minimum", tls._context.check_hostname and tls._context.verify_mode == ssl.CERT_REQUIRED and tls._context.minimum_version == ssl.TLSVersion.TLSv1_2)
    refused("config inside mailbox refused", lambda: a.validate_local_paths(folder, folder / "config.json"))
    link = root / "config-link"
    link.symlink_to(folder, target_is_directory=True)
    refused("config symlink into mailbox refused", lambda: a.validate_local_paths(folder, link / "config.json"))
    a.validate_local_paths(folder, config_path)
    ok("separate local config allowed", True)
    for key,value in [("version", True), ("messages", []), ("messages", [{"role": [], "content": "x"}]), ("messages", [{"role":"system","content":"x"}]), ("messages",[{"role":"user","content":"x"*4001}]), ("messages",[{"role":"assistant","content":"x"}]), ("planRevision",True), ("cancelled",1), ("endpoint",CONFIG["endpoint"]), ("contextText","x"*(a.CONTEXT_MAX+1))]:
        bad = {**req,key:value}
        put_request(bad)
        refused("malformed request refused " + key, lambda: a.read_request(folder))
    old = {**req,"createdAt":(dt.datetime.now(dt.timezone.utc)-dt.timedelta(minutes=6)).isoformat()}
    put_request(old)
    refused("five minute request expiry enforced", lambda: a.read_request(folder))
    put_request(req)
    (folder / a.CONTEXT_FILE).write_text(req["contextText"] + " ")
    refused("exact context text comparison", lambda: a.checked_context(folder,req))
    wrong = {**req,"planId":"p-another"}
    put_request(wrong)
    refused("context plan identity checked",lambda:a.checked_context(folder,wrong))
    put_request(req)
    opener = Opener()
    answer = a.ask_endpoint(CONFIG,"synthetic-secret",req,opener)
    outbound, timeout = opener.calls[0]
    body = json.loads(outbound.data)
    ok("POST exact company endpoint and configured model",outbound.method == "POST" and outbound.full_url == CONFIG["endpoint"] and body["model"] == "company-model")
    ok("bounded tokens, nonstreaming JSON requested",body["max_tokens"] == 4096 and body["stream"] is False and body["response_format"] == {"type":"json_object"})
    ok("credential only unredirected header",outbound.unredirected_hdrs.get("Authorization") == "Bearer synthetic-secret" and "Authorization" not in outbound.headers and "synthetic-secret" not in outbound.data.decode())
    ok("trusted instructions separated from context data and transcript",body["messages"][0]["role"] == "system" and body["messages"][1]["role"] == "user" and req["contextText"] in body["messages"][1]["content"])
    ok("plain assistant clarification returned",answer["message"] == opener.answer["message"] and "amendments" not in answer)
    api = Opener()
    a.ask_endpoint({**CONFIG,"auth":"api-key","responseFormat":"prompt","tokenParameter":"max_completion_tokens"},"synthetic-secret",req,api)
    api_body = json.loads(api.calls[0][0].data)
    ok("api-key and legacy prompt mode supported",api.calls[0][0].unredirected_hdrs.get("Api-key") == "synthetic-secret" and "response_format" not in api_body and api_body["max_completion_tokens"] == 4096)
    noauth = Opener()
    a.ask_endpoint({**CONFIG,"auth":"none"},None,req,noauth)
    ok("explicit unauthenticated company endpoint supported",not noauth.calls[0][0].unredirected_hdrs)
    refused("missing secret refused",lambda:a.ask_endpoint(CONFIG,None,req,Opener()))
    refused("header control characters refused",lambda:a.ask_endpoint(CONFIG,"x\r\ny",req,Opener()))
    redirect = a.RefuseRedirect()
    try:
        redirect.redirect_request(outbound,None,302,"",{},"https://other.example.com/steal")
        ok("redirect never followed",False)
    except urllib.error.HTTPError:
        ok("redirect never followed",True)
    for error in [urllib.error.HTTPError(CONFIG["endpoint"],302,"sensitive",{},None),urllib.error.HTTPError(CONFIG["endpoint"],401,"sensitive",{},None),urllib.error.HTTPError(CONFIG["endpoint"],429,"sensitive",{},None),urllib.error.HTTPError(CONFIG["endpoint"],500,"sensitive",{},None),urllib.error.URLError("sensitive"),TimeoutError("sensitive")]:
        try:
            a.ask_endpoint(CONFIG,"synthetic-secret",req,Opener(failure=error))
            ok("safe network error",False)
        except a.AssistantError as exc:
            ok("safe network error", "sensitive" not in str(exc) and "synthetic-secret" not in str(exc) and CONFIG["endpoint"] not in str(exc))
    for value in [[],{"message":""},{"message":"x"*4001},{"message":"x","tool":"run"},{"message":"x","amendments":[]},{"message":"x","amendments":{"kind":"sightline-amendments","version":1,"planId":"other"}}]:
        refused("malformed model answer refused",lambda value=value:a.validate_answer(value,req))
    am = {"kind":"sightline-amendments","version":1,"batchId":"model-batch","changes":[{"id":"model-change","summary":"Capture an idea","ops":[{"op":"add","type":"deliverable","id":"dv-new","value":{"name":"Logging idea","stage":"idea"}}]}]}
    valid = a.validate_answer({"message":"Review this idea.","amendments":am},req)["amendments"]
    ok("proposal plan and revision bound to request",valid["planId"] == req["planId"] and valid["basedOn"]["planRevision"] == req["planRevision"])
    ok("proposal receipt IDs bound to request without changing plan target",valid["batchId"].startswith("company-") and valid["changes"][0]["id"].startswith("chat-") and valid["changes"][0]["ops"][0]["id"] == "dv-new" and am["batchId"] == "model-batch")
    malformed = copy.deepcopy(am);malformed["changes"][0]["ops"][0]["op"] = []
    refused("unhashable model operation safely refused",lambda:a.validate_answer({"message":"x","amendments":malformed},req))
    put_request(req); clear_response(); transport = Opener()
    ok("mailbox request produces response",a.process_once(folder,CONFIG,"synthetic-secret",transport))
    response = json.loads((folder/a.RESPONSE_FILE).read_text())
    ok("response echoes exact request identity",response["status"] == "ok" and all(response[k] == req[k] for k in ("planId","requestId","conversationId","planRevision","jiraSyncedAt")))
    ok("restart does not repeat completed request",not a.process_once(folder,CONFIG,"synthetic-secret",transport) and len(transport.calls) == 1)
    ok("helper never creates proposal or changes context/request",not (folder/"sightline-amendments.json").exists() and (folder/a.CONTEXT_FILE).read_text() == req["contextText"] and json.loads((folder/a.REQUEST_FILE).read_text()) == req)
    clear_response();ledger = root / "state" / "last.json"
    ledger.parent.mkdir();ledger.write_text(json.dumps({k:req[k] for k in ("planId","requestId","conversationId","planRevision","jiraSyncedAt")}));transport = Opener()
    ok("interrupted previous request gets error without endpoint retry",a.process_once(folder,CONFIG,"synthetic-secret",transport,ledger) and not transport.calls and json.loads((folder/a.RESPONSE_FILE).read_text())["status"] == "error")
    clear_response();ledger.unlink();transport = Opener()
    a.process_once(folder,CONFIG,"synthetic-secret",transport,ledger)
    ok("request identity durably recorded before endpoint call",ledger.exists() and json.loads(ledger.read_text())["requestId"] == req["requestId"])
    clear_response();put_request({**req,"cancelled":True});transport=Opener()
    ok("cancelled request makes no endpoint call",not a.process_once(folder,CONFIG,"synthetic-secret",transport) and not transport.calls)
    put_request(req);clear_response()
    cancelled = Opener(callback=lambda:put_request({**req,"cancelled":True}))
    ok("inflight cancellation suppresses response publication",not a.process_once(folder,CONFIG,"synthetic-secret",cancelled) and not (folder/a.RESPONSE_FILE).exists())
    put_request(req)
    changed = Opener(callback=lambda:(folder/a.CONTEXT_FILE).write_text(req["contextText"]+" "))
    a.process_once(folder,CONFIG,"synthetic-secret",changed)
    ok("context change during endpoint call refuses proposed output",json.loads((folder/a.RESPONSE_FILE).read_text())["status"] == "error")
    put_request(req);clear_response()
    replaced = Opener(callback=lambda:put_request({**req,"requestId":"new-request"}))
    ok("replacement request suppresses old response",not a.process_once(folder,CONFIG,"synthetic-secret",replaced) and not (folder/a.RESPONSE_FILE).exists())
    put_request(req);(folder/a.RESPONSE_FILE).write_text('{"kind":"unrelated"}')
    refused("unrelated response file preserved",lambda:a.process_once(folder,CONFIG,"synthetic-secret",Opener()))
    ok("unrelated response content unchanged",(folder/a.RESPONSE_FILE).read_text() == '{"kind":"unrelated"}')
    clear_response();(folder/a.RESPONSE_FILE).symlink_to(root / "outside.json")
    refused("response symlink refused",lambda:a.write_atomic(folder/a.RESPONSE_FILE,{"message":"x"}))
    (folder/a.RESPONSE_FILE).unlink()
    a.write_atomic(folder/a.RESPONSE_FILE,{"message":"complete"})
    ok("atomic output leaves complete JSON and no temporary files",json.loads((folder/a.RESPONSE_FILE).read_text())["message"] == "complete" and not list(folder.glob(".sightline-chat-response-*.json")))
    with a.CompanionLock(folder,root/"locks"):
        refused("second companion lock refused",lambda:a.CompanionLock(folder,root/"locks").__enter__())
    with a.CompanionLock(folder,root/"locks"):
        ok("released companion lock allows restart",True)
    with mock.patch.object(a.sys,"platform","darwin"),mock.patch.object(a.subprocess,"run") as run:
        run.return_value.returncode=0;run.return_value.stdout="synthetic-secret\n"
        store=a.CredentialStore(CONFIG["endpoint"]);store.save("synthetic-secret")
        ok("keychain secret goes through stdin not argv","synthetic-secret" not in " ".join(run.call_args.args[0]) and "synthetic-secret" in run.call_args.kwargs["input"])
        ok("keychain retrieves secret",store.load() == "synthetic-secret")
    refused("keychain quoting refuses linebreak",lambda:a.quote_keychain("bad\nvalue"))
    ok("credentials bound to exact local endpoint",a.credential_target(CONFIG["endpoint"]) != a.credential_target(CONFIG["endpoint"]+"?api-version=1"))
    capture=io.StringIO()
    with mock.patch.object(a.sys,"stdout",capture):
        ok("init creates separate editable configuration",a.main(["init","--config",str(config_path)]) == 0 and config_path.exists())
        ok("global config flag supported before command",a.main(["--config",str(config_path),"setup","--endpoint",CONFIG["endpoint"],"--model","company-model","--auth","none"]) == 0)
    ok("configuration contains no API key","secret" not in config_path.read_text())

    other_config = root / "other-config" / "assistant.json"
    other_config.parent.mkdir()
    other_config.write_text(json.dumps({**CONFIG,"auth":"none"}))
    lock_paths = []
    lock_type = a.CompanionLock
    def observed_lock(folder: Path, directory: Path) -> object:
        lock = lock_type(folder,directory)
        lock_paths.append(lock.path)
        return lock
    with mock.patch.object(a,"CONFIG_DIR",root/"runtime"), mock.patch.object(a,"CompanionLock",side_effect=observed_lock), mock.patch.object(a,"process_once",return_value=False) as process, mock.patch.object(a.sys,"stdout",io.StringIO()):
        first = a.main(["run","--folder",str(folder),"--once","--config",str(config_path)])
        second = a.main(["run","--folder",str(folder),"--once","--config",str(other_config)])
        ok("different config directories share one per-user mailbox lock",first == 0 and second == 0 and len(lock_paths) == 2 and lock_paths[0] == lock_paths[1] and lock_paths[0].parent == root/"runtime"/"assistant-locks")
        ok("different config directories share one durable request ledger",process.call_args_list[0].kwargs["ledger"] == process.call_args_list[1].kwargs["ledger"] and process.call_args_list[0].kwargs["ledger"].parent == root/"runtime"/"assistant-state")
    with mock.patch.object(a,"CONFIG_DIR",folder/"runtime"):
        refused("runtime state inside mailbox refused",lambda:a.validate_local_paths(folder,config_path))
    with mock.patch.object(a,"CONFIG_DIR",folder):
        refused("per-user runtime directory cannot be mailbox",lambda:a.validate_local_paths(folder,config_path))

print(f"{passed}/{passed+failed} passed")
sys.exit(bool(failed))
