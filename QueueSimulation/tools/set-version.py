"""Sets the cache-busting version on every script, stylesheet and module import.

Browsers may keep JavaScript and CSS files in their cache for some minutes. After
a change, run this script with a new version so that every page loads matching
files instead of mixing old and new ones:

    python QueueSimulation/tools/set-version.py 4

Every reference to a local .js or .css file in the HTML pages, the JavaScript
modules and the tests then ends with "?v=4". The same version must be used
everywhere, because a module loaded under two different addresses would run twice.
"""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
version = sys.argv[1] if len(sys.argv) > 1 else None
if not version or not re.fullmatch(r"[0-9A-Za-z.]+", version):
    sys.exit("Usage: python set-version.py <version>, for example 4")

# Local references: ./x.js, ../js/x.js, ./css/style.css (with or without an existing ?v=).
pattern = re.compile(r"""(["'])(\.{1,2}/[^"'?]+\.(?:js|css))(?:\?v=[0-9A-Za-z.]+)?\1""")
changed = 0
for path in list(root.rglob("*.html")) + list(root.rglob("*.js")):
    text = path.read_text(encoding="utf-8")
    new = pattern.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={version}{m.group(1)}", text)
    if new != text:
        path.write_text(new, encoding="utf-8")
        changed += 1
print(f"Version {version} set in {changed} files.")
