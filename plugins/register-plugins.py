"""Register custom plugins in OnlyOffice configuration at build time."""
import json
from pathlib import Path

CUSTOM_PLUGINS = [
    "{B1AACC00-EC30-4DA4-A400-AAAAAA1110C5}",  # BIW Data Connector
    "{B1AACC00-EC30-4DA4-A400-AAAAAA1110C6}",  # BIW Charts
    "{B1AACC00-EC30-4DA4-A400-AAAAAA1110C7}",  # Brain Bridge
    "{B1AACC00-EC30-4DA4-A400-AAAAAA1110C8}",  # Data Analyzer
]

AUTOSTART_GUIDS = [
    "asc.{B1AACC00-EC30-4DA4-A400-AAAAAA1110C5}",  # BIW background
    "asc.{B1AACC00-EC30-4DA4-A400-AAAAAA1110C7}",  # Brain Bridge background
    "asc.{B1AACC00-EC30-4DA4-A400-AAAAAA1110C8}",  # Data Analyzer background
]

local_json = Path("/etc/onlyoffice/documentserver/local.json")
cfg = json.loads(local_json.read_text()) if local_json.exists() else {}
plugins_cfg = cfg.setdefault("services", {}).setdefault("CoAuthoring", {}).setdefault("plugins", {})
plugins_cfg["autostart"] = AUTOSTART_GUIDS
local_json.write_text(json.dumps(cfg, indent=2))

plugin_list = Path("/var/www/onlyoffice/documentserver/sdkjs-plugins/plugin-list-default.json")
pl = json.loads(plugin_list.read_text())
for guid in CUSTOM_PLUGINS:
    if guid not in pl:
        pl.append(guid)
plugin_list.write_text(json.dumps(pl, indent=2))

print(f"Registered {len(CUSTOM_PLUGINS)} custom plugins, {len(AUTOSTART_GUIDS)} autostart")
