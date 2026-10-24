#!/usr/bin/env bash
# Build Sightline: embed js-yaml and the release notes into the template -> dist/sightline.html
# Also regenerates CHANGELOG.md from src/releases.json.
# Optional: PUBLISH_TO=/path/to/file.html ./build.sh   (copies the build there too)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
python3 - <<'PY'
import base64, datetime, hashlib, io, json, pathlib, re, sys, zipfile

# ---- release notes: validate, then embed. A bad entry fails the build rather than shipping a broken page. ----
KINDS = {"new": "New", "improved": "Improved", "fixed": "Fixed"}
def fail(msg): sys.exit("releases.json: " + msg)
rel = json.load(open("src/releases.json", encoding="utf-8"))
if not isinstance(rel, list) or not rel: fail("must be a non-empty list, newest first")
def vkey(v): return tuple(int(x) for x in v.split("."))
seen, prev = set(), None
for r in rel:
    v = r.get("version", "")
    if not re.fullmatch(r"\d+\.\d+\.\d+", v): fail(f"version {v!r} is not MAJOR.MINOR.PATCH")
    if v in seen: fail(f"version {v} appears twice")
    seen.add(v)
    try: d = datetime.date.fromisoformat(r.get("date", ""))
    except ValueError: fail(f"{v}: date {r.get('date')!r} is not YYYY-MM-DD")
    if prev and not (vkey(v) < vkey(prev["version"])): fail(f"{v} must come after {prev['version']}: list newest first")
    if prev and d > datetime.date.fromisoformat(prev["date"]): fail(f"{v} is dated after the newer {prev['version']}")
    if not 1 <= len(r.get("headline", "")) <= 140: fail(f"{v}: headline must be 1-140 characters")
    ch = r.get("changes")
    if not isinstance(ch, list) or not ch: fail(f"{v}: needs at least one change")
    for c in ch:
        t = c.get("title", "")
        if c.get("kind") not in KINDS: fail(f"{v} / {t!r}: kind must be one of {', '.join(KINDS)}")
        for f, lo, hi in (("title", 1, 90), ("area", 1, 30), ("now", 1, 400)):
            if not lo <= len(c.get(f, "")) <= hi: fail(f"{v} / {t!r}: {f} must be {lo}-{hi} characters")
        for f, hi in (("before", 400), ("where", 200)):
            if f in c and not 1 <= len(c[f]) <= hi: fail(f"{v} / {t!r}: {f}, when given, must be 1-{hi} characters")
        extra = set(c) - {"kind", "area", "title", "before", "now", "where"}
        if extra: fail(f"{v} / {t!r}: unknown field(s) {', '.join(sorted(extra))}")
    prev = r

# Embedded inside a <script>. Every "<" becomes \u003c, so no text can close the script ("</script") or trip the
# parser's "<!--<script" state, which would keep the real closing tag from ending it. Also the JS line separators.
data = json.dumps(rel, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")

s = open("src/sightline.template.html", encoding="utf-8").read()
start, end = "<!--__SOURCE_NOTICE_START__-->", "<!--__SOURCE_NOTICE_END__-->"
assert s.count(start) == s.count(end) == 1, "source launch notice markers must occur once"
before_notice, notice = s.split(start)
notice, after_notice = notice.split(end)
s = before_notice + after_notice
y = open("src/js-yaml.min.js", encoding="utf-8").read()
t = s.replace("<script>/*__JSYAML__*/</script>",
  "<script>/* js-yaml 4.1.0 · MIT · embedded so the app works offline and loads no remote code */\n" + y + "\n</script>")
assert t != s, "js-yaml placeholder not found in template"
assert t.count("/*__RELEASES__*/[]") == 1, "release notes placeholder not found in template"
t = t.replace("/*__RELEASES__*/[]", data)
# Bundle the maintained skills into the existing application script. The HTML can
# deploy them without the source checkout, Python, Node, or a network connection.
skill_files = []
skill_root = pathlib.Path("skills")
if skill_root.is_symlink() or not skill_root.is_dir(): fail("skills folder is missing or linked")
for folder in sorted(skill_root.iterdir()):
    if not folder.is_dir(): continue
    if folder.is_symlink() or not re.fullmatch(r"sightline-[a-z0-9-]{1,50}", folder.name):
        fail("invalid skill folder")
    path = folder / "SKILL.md"
    if path.is_symlink() or not path.is_file(): fail("skill is missing SKILL.md")
    raw = path.read_bytes()
    if len(raw) > 65536: fail("skill text exceeds 64 KiB")
    text = raw.decode("utf-8")
    front = re.match(r"\A---\r?\n(.*?)\r?\n---", text, re.S)
    if not front: fail("skill frontmatter is missing")
    if not re.search(r"^name:\s*" + re.escape(folder.name) + r"\s*$", front[1], re.M): fail("skill name must match its folder")
    description = re.search(r"^description:\s*(.+)$", front[1], re.M)
    if not description: fail("skill description is missing")
    skill_files.append({"name":folder.name, "description":description[1].strip().strip("\"'"), "path":folder.name + "/SKILL.md", "text":text, "sha256":hashlib.sha256(raw).hexdigest()})
if not 1 <= len(skill_files) <= 32 or sum(len(x["text"].encode("utf-8")) for x in skill_files) > 512 * 1024:
    fail("skill collection must contain 1-32 skills and fit within 512 KiB")
archive = io.BytesIO()
license_text = pathlib.Path("LICENSE").read_text(encoding="utf-8")
if len(license_text.encode("utf-8")) > 16384: fail("license text exceeds 16 KiB")
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for item in skill_files + [{"path":"LICENSE", "text":license_text}]:
        info = zipfile.ZipInfo(item["path"], date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info, item["text"].encode("utf-8"))
bundle = {"version":rel[0]["version"], "files":skill_files, "license":license_text, "archive":base64.b64encode(archive.getvalue()).decode("ascii")}
skill_data = json.dumps(bundle, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
assert t.count('/*__SKILLS__*/{"version":"dev","files":[],"archive":""}') == 1, "skills placeholder not found"
t = t.replace('/*__SKILLS__*/{"version":"dev","files":[],"archive":""}', skill_data)
# The version stamp near the top of the page, which the Jira sync reads to tell an open page a newer copy is there.
assert t.count('<meta name="sightline-version" content="dev">') == 1, "version meta placeholder not found in template"
t = t.replace('<meta name="sightline-version" content="dev">', f'<meta name="sightline-version" content="{rel[0]["version"] if rel else "0.0.0"}">')

# Scripts are pure ASCII: every other character becomes a \u escape (same meaning in JS strings, regexes, comments).
# An editor or remote-desktop copy that re-encodes the file then can't change a script's bytes, and so its hash.
def ascii_js(x):
    out = []
    for c in x:
        o = ord(c)
        if o < 128: out.append(c)
        elif o < 0x10000: out.append("\\u%04x" % o)
        else: o -= 0x10000; out.append("\\u%04x\\u%04x" % (0xD800 + (o >> 10), 0xDC00 + (o & 0x3FF)))
    return "".join(out)
t = re.sub(r"<script>(.*?)</script>", lambda m: "<script>" + ascii_js(m.group(1)) + "</script>", t, flags=re.S)

# CSP: allow exactly the inline scripts this build contains, by hash, instead of 'unsafe-inline'.
# A single static file has no server to issue a nonce; a hash is the equivalent. Any script that
# isn't byte-for-byte one of these - injected or edited after the build - will not run.
scripts = re.findall(r"<script>(.*?)</script>", t, re.S)
assert len(scripts) == 2, f"expected 2 inline scripts, found {len(scripts)}"
hashes = " ".join("'sha256-" + base64.b64encode(hashlib.sha256(x.encode("utf-8")).digest()).decode() + "'" for x in scripts)
before = "script-src 'unsafe-inline'"
assert t.count(before) == 1, "CSP script-src not found"
t = t.replace(before, "script-src " + hashes)

open("dist/sightline.html", "w", encoding="utf-8").write(t)
open("dist/app.js", "w", encoding="utf-8").write(scripts[-1])

# ---- CHANGELOG.md for anyone reading the repo. Generated: edit src/releases.json, not this file. ----
out = ["# Sightline release notes", "",
       "<!-- Generated by build.sh from src/releases.json. Edit that file, not this one. -->", ""]
for r in rel:
    d = datetime.date.fromisoformat(r["date"])
    out += [f"## {r['version']} · {d.strftime('%b')} {d.day}, {d.year}", "", r["headline"][0].upper() + r["headline"][1:] + ".", ""]
    for k, label in KINDS.items():
        items = [c for c in r["changes"] if c["kind"] == k]
        if not items: continue
        out += [f"### {label}", ""]
        for c in items:
            line = f"- **{c['title']}** ({c['area']}). {c['now']}"
            if c.get("where"): line += f" *Where:* {c['where']}"
            out.append(line)
        out.append("")
open("CHANGELOG.md", "w", encoding="utf-8").write("\n".join(out).rstrip() + "\n")
print(f"release notes: {len(rel)} releases, latest {rel[0]['version']}")
PY
node --check dist/app.js
echo "built dist/sightline.html"
if [ -n "${PUBLISH_TO:-}" ]; then
  cp dist/sightline.html "$PUBLISH_TO"
  # A checksum beside the copy: on another machine, `sha256sum -c <file>.sha256` says whether the copy is intact.
  (cd "$(dirname "$PUBLISH_TO")" && shasum -a 256 "$(basename "$PUBLISH_TO")" > "$(basename "$PUBLISH_TO").sha256")
  echo "published -> $PUBLISH_TO (+ .sha256)"
fi
