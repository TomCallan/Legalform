#!/usr/bin/env python3
"""
LegalForm MCP (Model Context Protocol) Server
Exposes LegalForm deployment, listing, re-opening, closing, purging, exporting, and PDF generation tools to AI agents (Claude Code, Antigravity CLI, OpenCode, Cursor, etc.).
"""

import os
import sys
import json
import requests
from typing import Any, Dict, List

def get_config():
    api_base = os.getenv("LEGALFORM_API", "http://127.0.0.1:8787").strip(' "\'').rstrip("/")
    api_key = os.getenv("LEGALFORM_KEY", "").strip(' "\'')
    pages_base = os.getenv("LEGALFORM_PAGES", "https://legalform-ui.pages.dev").strip(' "\'').rstrip("/")
    return api_base, api_key, pages_base

TOOLS = [
    {
        "name": "legalform_deploy_document",
        "description": "Deploy a YAML legal document specification (NDA, Affidavit, Contract, Waiver) to Cloudflare Workers API.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "spec_yaml": {"type": "string", "description": "Raw YAML string of document specification"},
                "admin_email": {"type": "string", "description": "Recipient notification email for executed copy"}
            },
            "required": ["spec_yaml"]
        }
    },
    {
        "name": "legalform_list_documents",
        "description": "List all deployed document agreements, active/closed statuses, execution signature counts, and signing URLs.",
        "inputSchema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "legalform_reopen_slug",
        "description": "Re-activate / re-up a closed or expired document slug and extend its validity period.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "slug": {"type": "string", "description": "Document slug or ID to reopen"},
                "extend_days": {"type": "integer", "description": "Number of days to extend validity (default: 30)"}
            },
            "required": ["slug"]
        }
    },
    {
        "name": "legalform_close_slug",
        "description": "Force close an active document slug so it can no longer be viewed or signed.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "slug": {"type": "string", "description": "Document slug or ID to force close"}
            },
            "required": ["slug"]
        }
    },
    {
        "name": "legalform_delete_document",
        "description": "Permanently delete a document record from D1 database and purge all associated JSON records from R2 vault.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "doc_id": {"type": "string", "description": "Document ID to permanently delete"}
            },
            "required": ["doc_id"]
        }
    },
    {
        "name": "legalform_export_submission",
        "description": "Export completed submission JSON records and cryptographic audit trail for a given document ID.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "doc_id": {"type": "string", "description": "Document ID to export"}
            },
            "required": ["doc_id"]
        }
    }
]

def handle_call_tool(name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    api_base, api_key, pages_base = get_config()
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        if name == "legalform_deploy_document":
            import yaml
            spec_str = arguments["spec_yaml"]
            spec_obj = yaml.safe_load(spec_str)
            doc_id = spec_obj["document"]["id"]
            slug = doc_obj_slug = spec_obj["document"].get("slug") or doc_id

            if arguments.get("admin_email"):
                spec_obj["document"]["admin_notification_email"] = arguments["admin_email"]

            payload = {
                "id": doc_id,
                "slug": slug,
                "spec": json.dumps(spec_obj),
                "expires_at": int(os.time() if hasattr(os, 'time') else 0) + (spec_obj["document"].get("expires_in_days", 30) * 86400),
                "max_per_email": spec_obj["document"].get("max_submissions_per_email", 1),
                "max_per_ip": spec_obj["document"].get("max_submissions_per_ip", 3),
                "require_verification": spec_obj["document"].get("require_email_verification", False)
            }

            r = requests.post(f"{api_base}/api/documents", json=payload, headers=headers, timeout=15)
            r.raise_for_status()
            res = r.json()
            return {"content": [{"type": "text", "text": json.dumps(res, indent=2)}]}

        elif name == "legalform_list_documents":
            r = requests.get(f"{api_base}/api/documents/list", headers=headers, timeout=15)
            r.raise_for_status()
            return {"content": [{"type": "text", "text": json.dumps(r.json(), indent=2)}]}

        elif name == "legalform_reopen_slug":
            slug = arguments["slug"]
            days = arguments.get("extend_days", 30)
            r = requests.post(f"{api_base}/api/doc/{slug}/reopen", json={"extend_days": days}, headers=headers, timeout=15)
            r.raise_for_status()
            return {"content": [{"type": "text", "text": json.dumps(r.json(), indent=2)}]}

        elif name == "legalform_close_slug":
            slug = arguments["slug"]
            r = requests.post(f"{api_base}/api/doc/{slug}/close", headers=headers, timeout=15)
            r.raise_for_status()
            return {"content": [{"type": "text", "text": json.dumps(r.json(), indent=2)}]}

        elif name == "legalform_delete_document":
            doc_id = arguments["doc_id"]
            r = requests.delete(f"{api_base}/api/doc/{doc_id}", headers=headers, timeout=15)
            r.raise_for_status()
            return {"content": [{"type": "text", "text": json.dumps(r.json(), indent=2)}]}

        elif name == "legalform_export_submission":
            doc_id = arguments["doc_id"]
            r = requests.get(f"{api_base}/api/export/{doc_id}", headers=headers, timeout=15)
            r.raise_for_status()
            return {"content": [{"type": "text", "text": json.dumps(r.json(), indent=2)}]}

        else:
            return {"isError": True, "content": [{"type": "text", "text": f"Unknown tool: {name}"}]}

    except Exception as e:
        return {"isError": True, "content": [{"type": "text", "text": f"Error executing {name}: {str(e)}"}]}

def run_stdio_server():
    """Stdio JSON-RPC server loop for MCP integration."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            req_id = req.get("id")
            method = req.get("method")

            if method == "initialize":
                resp = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "legalform-mcp", "version": "1.0.0"}
                    }
                }
            elif method == "tools/list":
                resp = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {"tools": TOOLS}
                }
            elif method == "tools/call":
                params = req.get("params", {})
                name = params.get("name")
                args = params.get("arguments", {})
                res = handle_call_tool(name, args)
                resp = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": res
                }
            else:
                resp = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {"code": -32601, "message": f"Method not found: {method}"}
                }

            sys.stdout.write(json.dumps(resp) + "\n")
            sys.stdout.flush()
        except Exception as err:
            err_resp = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32603, "message": str(err)}
            }
            sys.stdout.write(json.dumps(err_resp) + "\n")
            sys.stdout.flush()

if __name__ == "__main__":
    run_stdio_server()
