# Scrapling Stealth Fetcher Setup (macOS 13)

`curl_cffi` v0.14.0 hardcodes `/Users/runner/work/_temp/install/lib` as the download target for
libcurl-impersonate on macOS, which fails on local machines without that path. To unblock Scrapling’s stealth
fetchers + CLI:

1. Download the sdist and patch `libs.json`:
   ```bash
   cd /tmp
   curl -L -o curl_cffi-0.14.0.tar.gz \
     https://files.pythonhosted.org/packages/9b/c9/0067d9a25ed4592b022d4558157fcdb6e123516083700786d38091688767/curl_cffi-0.14.0.tar.gz
   tar -xzf curl_cffi-0.14.0.tar.gz
   cd curl_cffi-0.14.0
   python3 - <<'PY'
   import json
   from pathlib import Path
   data = json.loads(Path('libs.json').read_text())
   for entry in data:
       if entry.get('system') == 'Darwin':
           entry['libdir'] = './libcurl-macos'
   Path('libs.json').write_text(json.dumps(data, indent=4))
   PY
   ```

2. Install the patched package into the project venv:
   ```bash
   /Users/Nutron/.openclaw/workspace/parts-king/.venv/bin/pip install '.[shell]'
   ```

3. Install Scrapling with the `shell` extras (now that `curl_cffi` builds):
   ```bash
   cd /Users/Nutron/.openclaw/workspace/parts-king
   source .venv/bin/activate
   pip install 'scrapling[shell]'
   ```

This provides the `scrapling` CLI plus stealth fetchers (Playwright, Patchright, curl_cffi) under the
`parts-king/.venv` environment so the future Python crawlers can bypass Cloudflare on Jack’s Small Engines,
RepairClinic, etc.
