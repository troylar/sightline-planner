#!/usr/bin/env python3
"""build.sh refuses bad release notes, and embeds good ones safely. Runs builds in a temp copy."""
import hashlib
import json
from html.parser import HTMLParser
import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
GOOD = json.loads((ROOT / "src" / "releases.json").read_text(encoding="utf-8"))
passed = failed = 0


class LaunchPage(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[str] = []
        self.automatic_navigation = False
        self.csp = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = dict(attrs)
        if tag == "a":
            self.links.append(a.get("href") or "")
        if tag == "script" or (tag == "meta" and (a.get("http-equiv") or "").lower() == "refresh"):
            self.automatic_navigation = True
        if tag == "meta" and (a.get("http-equiv") or "").lower() == "content-security-policy":
            self.csp = a.get("content") or ""


def ok(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("  FAIL", name, extra)


def build(releases, skill_mutator=None, tool_mutator=None, src_mutator=None):
    with tempfile.TemporaryDirectory() as t:
        t = pathlib.Path(t)
        shutil.copytree(ROOT / "src", t / "src")
        shutil.copytree(ROOT / "skills", t / "skills")
        shutil.copy(ROOT / "build.sh", t / "build.sh")
        shutil.copy(ROOT / "LICENSE", t / "LICENSE")
        shutil.copytree(ROOT / "tools", t / "tools")
        if skill_mutator:
            skill_mutator(t / "skills")
        if tool_mutator:
            tool_mutator(t / "tools")
        if src_mutator:
            src_mutator(t / "src")
        (t / "src" / "releases.json").write_text(json.dumps(releases), encoding="utf-8")
        r = subprocess.run(["bash", str(t / "build.sh")], capture_output=True, text=True)
        page = (t / "dist" / "sightline.html").read_text(encoding="utf-8") if r.returncode == 0 else ""
        return r.returncode, r.stdout + r.stderr, page


def bad(name, mutate, expect):
    rel = json.loads(json.dumps(GOOD))
    mutate(rel)
    code, out, _ = build(rel)
    ok(f"refuses {name}", code != 0 and expect in out, out.strip().splitlines()[-1] if out.strip() else "")


code, out, page = build(GOOD)
ok("the real release notes build", code == 0, out[-200:])
# The assistant scripts are stamped with the page version and published beside the page, each with a checksum.
with tempfile.TemporaryDirectory() as t, tempfile.TemporaryDirectory() as pub:
    t, pub = pathlib.Path(t), pathlib.Path(pub)
    for d in ("src", "skills", "tools"):
        shutil.copytree(ROOT / d, t / d)
    shutil.copy(ROOT / "build.sh", t / "build.sh"); shutil.copy(ROOT / "LICENSE", t / "LICENSE")
    r = subprocess.run(["bash", str(t / "build.sh")], capture_output=True, text=True, env={**__import__("os").environ, "PUBLISH_TO": str(pub / "plan.html")})
    ver = GOOD[0]["version"]
    ok("dist carries both scripts, stamped with the page version", r.returncode == 0 and all(f'PAGE_VERSION = "{ver}"' in (t / "dist" / n).read_text() for n in ("sightline-app.py", "sightline-jira-sync.py")), (r.stdout + r.stderr)[-300:])
    ok("the source copies stay unstamped", all("\nPAGE_VERSION = None\n" in (ROOT / "tools" / n).read_text() for n in ("sightline-app.py", "sightline-jira-sync.py")))
    names = ["plan.html", "sightline-app.py", "sightline-jira-sync.py"]
    ok("PUBLISH_TO copies the page and both scripts, each with a .sha256", all((pub / n).is_file() and (pub / (n + ".sha256")).is_file() for n in names), str(sorted(x.name for x in pub.iterdir())))
    ok("each checksum matches its copy", all((pub / (n + ".sha256")).read_text().split()[0] == hashlib.sha256((pub / n).read_bytes()).hexdigest() for n in names if (pub / n).is_file()))
    v = subprocess.run([sys.executable, str(pub / "sightline-app.py"), "--version"], capture_output=True, text=True)
    ok("the published sightline-app.py says which page it matches", v.stdout.strip() == f"sightline-app.py for Sightline {ver}", v.stdout + v.stderr)
    ok("no compiled files are left in dist", not (t / "dist" / "__pycache__").exists())
    tpage = (t / "dist" / "sightline.html").read_text(encoding="utf-8")
    tb = json.loads(tpage.split("const BUNDLED_TOOLS = ", 1)[1].split(";\n", 1)[0])
    ok("the page embeds both tools as the exact stamped bytes in dist", tb["version"] == ver and [f["name"] for f in tb["files"]] == ["sightline-app.py", "sightline-jira-sync.py"]
       and all(f["text"].encode("utf-8") == (t / "dist" / f["name"]).read_bytes() for f in tb["files"]))
    ok("and the published copies, whose checksums match the embedded ones", all(f["text"].encode("utf-8") == (pub / f["name"]).read_bytes()
       and (pub / (f["name"] + ".sha256")).read_text().split()[0] == f["sha256"] == hashlib.sha256(f["text"].encode("utf-8")).hexdigest() for f in tb["files"]))
import io, zipfile, base64, hashlib
bundle = json.loads(page.split("const BUNDLED_SKILLS = ", 1)[1].split(";\n", 1)[0])
ok("the HTML carries versioned planning skills", bundle["version"] == GOOD[0]["version"] and len(bundle["files"]) == len(list((ROOT / "skills").glob("*/SKILL.md"))))
with zipfile.ZipFile(io.BytesIO(base64.b64decode(bundle["archive"]))) as archive:
    ok("a standard ZIP reader sees the exact bundled skills", all(archive.read(item["path"]) == (ROOT / "skills" / item["name"] / "SKILL.md").read_bytes() == item["text"].encode("utf-8") for item in bundle["files"]))
    ok("the download includes the project license", archive.read("LICENSE") == (ROOT / "LICENSE").read_bytes())
ok("bundled hashes describe exact UTF-8 bytes", all(hashlib.sha256(item["text"].encode("utf-8")).hexdigest() == item["sha256"] for item in bundle["files"]))
def mutate_skill(root):
    p = next(root.glob("*/SKILL.md"))
    p.write_text(p.read_text() + '\n</script><script>window.skillPwned=1</script><!--<script>\u2028\U0001f642\n', encoding="utf-8")
code, out, skill_page = build(GOOD, mutate_skill)
ok("untrusted skills cannot close the script", code == 0 and skill_page.count("<script>") == 2 and "</script><script>window.skillPwned" not in skill_page)
skill_bundle = json.loads(skill_page.split("const BUNDLED_SKILLS = ", 1)[1].split(";\n", 1)[0])
ok("escaping keeps original skill text", any("</script><script>window.skillPwned=1</script><!--<script>\u2028\U0001f642" in item["text"] for item in skill_bundle["files"]))
def mutate_tool(root):
    p = root / "sightline-app.py"
    p.write_text(p.read_text(encoding="utf-8") + '\n# </script><script>window.toolPwned=1</script><!--<script>\u2028\n', encoding="utf-8")
code, out, tool_page = build(GOOD, tool_mutator=mutate_tool)
ok("tool text cannot close the page's script", code == 0 and tool_page.count("<script>") == 2 and "</script><script>window.toolPwned" not in tool_page, out[-200:])
tool_bundle = json.loads(tool_page.split("const BUNDLED_TOOLS = ", 1)[1].split(";\n", 1)[0]) if code == 0 else {"files": []}
ok("and the embedded tool keeps its text exactly", any("</script><script>window.toolPwned=1</script><!--<script>\u2028" in f["text"] for f in tool_bundle["files"]))
code, out, _ = build(GOOD, tool_mutator=lambda root: (root / "sightline-jira-sync.py").write_text((root / "sightline-jira-sync.py").read_text(encoding="utf-8") + "#" + "x" * 600000 + "\n", encoding="utf-8"))
ok("tools over the size budget fail the build", code != 0 and "512 KiB" in out, out[-200:])
code, out, _ = build(GOOD, lambda root: next(root.glob("*/SKILL.md")).unlink())
ok("missing skill fails the build", code != 0 and "missing SKILL.md" in out)
def too_large_skill(root):
    next(root.glob("*/SKILL.md")).write_text("\U0001f642" * 17000, encoding="utf-8")
code, out, _ = build(GOOD, too_large_skill)
ok("skill limits count bytes, not characters", code != 0 and "exceeds 64 KiB" in out)
code, out, page = build(GOOD)
source = (ROOT / "src" / "sightline.template.html").read_text(encoding="utf-8")
ok("the source template has a persistent launch notice", 'id="sourceNotice"' in source and 'href="../dist/sightline.html"' in source)
ok("the distributed app omits source-only launch guidance", 'id="sourceNotice"' not in page and "__SOURCE_NOTICE" not in page)
launcher = LaunchPage()
entry = ROOT / "index.html"
launcher.feed(entry.read_text(encoding="utf-8") if entry.exists() else "")
ok("the repository start page opens the built application", "dist/sightline.html" in launcher.links)
ok("the start page leaves navigation under the user's control", entry.exists() and not launcher.automatic_navigation and "default-src 'none'" in launcher.csp and "base-uri 'none'" in launcher.csp)

bad("versions out of order", lambda r: r.reverse(), "newest first")
bad("a duplicate version", lambda r: r[1].update(version=r[0]["version"]), "appears twice")
bad("a version that isn't MAJOR.MINOR.PATCH", lambda r: r[0].update(version="1.1"), "MAJOR.MINOR.PATCH")
bad("a bad date", lambda r: r[0].update(date="Sep 26"), "YYYY-MM-DD")
bad("a newer release dated before an older one", lambda r: r[0].update(date="2020-01-01"), "dated after")
bad("an unknown kind", lambda r: r[0]["changes"][0].update(kind="feature"), "kind must be one of")
bad("a change with no 'now'", lambda r: r[0]["changes"][0].pop("now"), "now must be")
bad("a title that's too long", lambda r: r[0]["changes"][0].update(title="x" * 91), "title must be")
bad("a misspelled field", lambda r: r[0]["changes"][0].update(befor="typo"), "unknown field")
bad("a release with no changes", lambda r: r[0].update(changes=[]), "at least one change")
bad("an empty list", lambda r: r.clear(), "non-empty list")

# Text that tries to close the script tag must be embedded as data, not break out of it.
evil = json.loads(json.dumps(GOOD))
evil[0]["changes"][0]["now"] = "</script><script>window.pwned=1</script>"
code, out, page = build(evil)
ok("text containing </script> still builds", code == 0, out[-200:])
ok("and can't break out of the page's script", page.count("<script>") == 2 and "window.pwned" in page and "</script><script>window.pwned" not in page)
ok("and the text still reads back exactly", "</script><script>window.pwned=1</script>" in json.loads(page.split("const RELEASES = ",1)[1].split(";\n",1)[0])[0]["changes"][0]["now"])
evil2 = json.loads(json.dumps(GOOD))
evil2[0]["changes"][0]["now"] = "<!--<script>"
code, out, page = build(evil2)
ok("text containing <!--<script> can't keep the script from closing", code == 0 and "<!--" not in page.split("const RELEASES = ",1)[1].split(";\n",1)[0])

# The page survives a copy that re-encodes it: scripts are pure ASCII, so their bytes (and CSP hashes) can't change.
import base64, hashlib, re
code, out, page = build(GOOD)
scripts = re.findall(r"<script>(.*?)</script>", page, re.S)
ok("scripts are pure ASCII", scripts and all(all(ord(c) < 128 for c in x) for x in scripts))
mangled = page.encode("utf-8").decode("cp1252", errors="replace")          # what a wrong-encoding re-save looks like
h = lambda x: "'sha256-" + base64.b64encode(hashlib.sha256(x.encode("utf-8")).digest()).decode() + "'"
csp = re.search(r"script-src ([^;]+);", page).group(1)
ok("a re-encoded copy still matches the page's CSP", all(h(x) in csp for x in re.findall(r"<script>(.*?)</script>", mangled, re.S)))
ok("the page says so if its code is blocked", 'id="bootfail"' in page and "Sightline didn't start" in page and 'getElementById("bootfail")?.remove()' in page)

# The font is embedded from src/fonts, pinned by SHA-256: no font request, and a changed file fails the build.
code, out, page = build(GOOD)
fm = json.loads((ROOT / "src" / "fonts" / "fonts.json").read_text(encoding="utf-8"))
faces = re.findall(r'@font-face\{font-family:"Instrument Sans";font-style:(\w+);[^}]*src:url\(data:font/woff2;base64,([A-Za-z0-9+/=]+)\)', page)
ok("the page embeds each pinned font file, byte for byte", len(faces) == len(fm["files"]) == 3 and all(base64.b64decode(b) == (ROOT / "src" / "fonts" / f["file"]).read_bytes() and st == f["style"] for (st, b), f in zip(faces, fm["files"])), str(len(faces)))
pol = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', page).group(1)
ok("fonts come only from the page itself (font-src data:)", re.search(r"font-src ([^;]+);", pol).group(1).strip() == "data:" and "googleapis" not in pol and "gstatic" not in pol, pol)
ok("the page names no font server at all", "fonts.googleapis.com" not in page and "fonts.gstatic.com" not in page)
ok("the font's copyright and license travel with it", "Copyright 2022 The Instrument Sans Project Authors" in page and "SIL Open Font License 1.1" in page)
def swap_font(src):
    f = src / "fonts" / fm["files"][0]["file"]; b = bytearray(f.read_bytes()); b[-1] ^= 1; f.write_bytes(bytes(b))
code, out, _ = build(GOOD, src_mutator=swap_font)
ok("refuses a font file that doesn't match its pin", code != 0 and "doesn't match its pinned SHA-256" in out, out.strip().splitlines()[-1] if out.strip() else "")

print(f"{passed}/{passed + failed} passed")
sys.exit(1 if failed else 0)
