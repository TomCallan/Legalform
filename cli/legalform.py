import os
import json
import yaml
import requests
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(help="LegalForm CLI - Deploy and manage electronic legal documents locally or on Cloudflare.")
console = Console()

REGISTRY_FILE = Path(".legalform_registry.json")

def get_config():
    api_base = os.getenv("LEGALFORM_API", "http://127.0.0.1:8787").strip(' "\'').rstrip("/")
    api_key = os.getenv("LEGALFORM_KEY", "").strip(' "\'')
    pages_base = os.getenv("LEGALFORM_PAGES", "http://localhost:8080").strip(' "\'').rstrip("/")
    admin_email = os.getenv("LEGALFORM_ADMIN_EMAIL", "").strip(' "\'')
    return api_base, api_key, pages_base, admin_email


@app.command()
def init(name: str = typer.Option("document.yaml", "--output", "-o", help="Output YAML filename")):
    """Initialize a starter YAML document specification with support for pre-filled contents."""
    template = {
        "document": {
            "id": f"nda-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
            "title": "Mutual Non-Disclosure Agreement",
            "jurisdiction": "State of Delaware, USA",
            "expires_in_days": 30,
            "max_submissions_per_email": 1,
            "max_submissions_per_ip": 3,
            "require_email_verification": False,
            "admin_notification_email": "",
            "legal_footer": "By signing, you agree that this electronic signature constitutes your intent to be bound under the ESIGN Act and eIDAS Regulation."
        },
        "sections": [
            {
                "type": "static",
                "content": "## 1. Confidential Information\n'Confidential Information' refers to non-public technical, financial, or business details disclosed by either party."
            },
            {
                "type": "field",
                "name": "counterparty_name",
                "label": "Counterparty Legal Name",
                "required": True,
                "value": "Acme Corporation"  # Pre-filled default
            },
            {
                "type": "field",
                "name": "counterparty_email",
                "label": "Email Address",
                "field_type": "email",
                "required": True,
                "value": "legal@acme.com"  # Pre-filled default
            },
            {
                "type": "field",
                "name": "effective_date",
                "label": "Effective Date",
                "field_type": "date",
                "default": "today"
            },
            {
                "type": "signature",
                "signer_label": "Authorized Signer"
            }
        ]
    }
    
    path = Path(name)
    path.write_text(yaml.dump(template, sort_keys=False, allow_unicode=True))
    console.print(f"[bold green]Created document template:[/bold green] {path.resolve()}")

@app.command()
def deploy(
    spec_path: Path = typer.Argument(Path("document.yaml"), help="Path to YAML spec"),
    fill: list[str] = typer.Option([], "--fill", "-f", help="Pre-fill field values (e.g. -f counterparty_name='Acme Corp')"),
    admin_email: str = typer.Option("", "--admin-email", "-a", help="Recipient email for admin notification copy of signed document")
):
    """Deploy a document specification to Cloudflare Worker or local backend API with optional field pre-filling."""
    if not spec_path.exists():
        console.print(f"[bold red]Error:[/bold red] File {spec_path} does not exist.")
        raise typer.Exit(code=1)

    api_base, api_key, pages_base, env_admin_email = get_config()
    spec = yaml.safe_load(spec_path.read_text())
    doc_meta = spec.get("document", {})

    # Set admin notification email priority: CLI option > ENV var > YAML spec
    final_admin_email = admin_email or env_admin_email or doc_meta.get("admin_notification_email", "")
    if final_admin_email:
        doc_meta["admin_notification_email"] = final_admin_email
        spec["document"] = doc_meta
    doc_meta = spec.get("document", {})
    doc_id = doc_meta.get("id")
    if not doc_id:
        console.print("[bold red]Error:[/bold red] YAML spec missing 'document.id'.")
        raise typer.Exit(code=1)

    # Apply pre-fill overrides from CLI --fill arguments
    prefills = {}
    for item in fill:
        if "=" in item:
            k, v = item.split("=", 1)
            prefills[k.strip()] = v.strip()

    if prefills:
        for section in spec.get("sections", []):
            field_name = section.get("name")
            if field_name in prefills:
                val = prefills[field_name]
                if val.lower() == 'true': val = True
                elif val.lower() == 'false': val = False
                section["value"] = val

    slug = hashlib.sha256(f"{doc_id}-{datetime.now().isoformat()}".encode()).hexdigest()[:12]
    expires_days = doc_meta.get("expires_in_days", 30)
    expires_at = int((datetime.now() + timedelta(days=expires_days)).timestamp())

    payload = {
        "id": doc_id,
        "slug": slug,
        "spec": json.dumps(spec),
        "expires_at": expires_at,
        "max_per_email": doc_meta.get("max_submissions_per_email", 1),
        "max_per_ip": doc_meta.get("max_submissions_per_ip", 3),
        "require_verification": doc_meta.get("require_email_verification", False)
    }

    api_base, api_key, pages_base, env_admin_email = get_config()
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    with console.status("[bold blue]Deploying document...[/bold blue]"):
        try:
            r = requests.post(f"{api_base}/api/documents", json=payload, headers=headers, timeout=15)
            r.raise_for_status()
        except requests.RequestException as e:
            console.print(f"[bold red]Deployment failed:[/bold red] {e}")
            if hasattr(e, 'response') and e.response is not None:
                console.print(f"Server response: {e.response.text}")
            raise typer.Exit(code=1)

    signing_url = f"{pages_base}/?slug={slug}"
    console.print("\n[bold green]🚀 Document Deployed Successfully![/bold green]")
    console.print(f"• Document ID: [cyan]{doc_id}[/cyan]")
    console.print(f"• Signing URL: [bold underline cyan]{signing_url}[/bold underline cyan]")
    if prefills:
        console.print(f"• Pre-filled Fields: [yellow]{prefills}[/yellow]")
    console.print(f"• Expiry Date: {datetime.fromtimestamp(expires_at).strftime('%Y-%m-%d %H:%M:%S')}")

    # Local registry logging
    registry = []
    if REGISTRY_FILE.exists():
        try:
            registry = json.loads(REGISTRY_FILE.read_text())
        except Exception:
            registry = []

    registry.append({
        "id": doc_id,
        "slug": slug,
        "url": signing_url,
        "spec_file": str(spec_path),
        "deployed_at": datetime.now().isoformat(),
        "prefills": prefills
    })
    REGISTRY_FILE.write_text(json.dumps(registry, indent=2))

@app.command("serve")
def serve(port: int = typer.Option(8080, "--port", "-p", help="Port for local static UI server")):
    """Serve the legal document web UI locally."""
    import http.server
    import socketserver
    
    pages_dir = Path(__file__).parent.parent / "pages"
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(pages_dir), **kwargs)

    console.print(f"[bold green]Starting local web UI server on http://localhost:{port}[/bold green]")
    console.print(f"Serving UI from [cyan]{pages_dir.resolve()}[/cyan]")
    with socketserver.TCPServer(("", port), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            console.print("\n[yellow]Local server stopped.[/yellow]")

@app.command("list")
def list_docs(remote: bool = typer.Option(True, "--remote/--local-registry", help="Fetch active documents from backend API vs local file registry")):
    """List all deployed documents and active signing slugs."""
    api_base, api_key, pages_base, _ = get_config()
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    if remote:
        with console.status("[bold blue]Fetching documents from backend...[/bold blue]"):
            try:
                r = requests.get(f"{api_base}/api/documents/list", headers=headers, timeout=15)
                r.raise_for_status()
                docs = r.json().get("documents", [])
                
                table = Table(title="Deployed Legal Documents (Backend API)")
                table.add_column("Document ID", style="cyan")
                table.add_column("Slug", style="magenta")
                table.add_column("Status", style="yellow")
                table.add_column("Signing URL", style="green")
                table.add_column("Expires", style="dim")

                for d in docs:
                    status_color = "green" if d["status"] == "active" else "red"
                    url = f"{pages_base}/?slug={d['slug']}"
                    exp = datetime.fromtimestamp(d["expires_at"]).strftime('%Y-%m-%d %H:%M') if d.get("expires_at") else "Never"
                    table.add_row(
                        d["id"],
                        d["slug"],
                        f"[{status_color}]{d['status']}[/{status_color}]",
                        url,
                        exp
                    )

                console.print(table)
                return
            except requests.RequestException as e:
                console.print(f"[bold yellow]Could not fetch from remote API ({e}). Falling back to local registry.[/bold yellow]")

    if not REGISTRY_FILE.exists():
        console.print("[yellow]No deployed documents recorded in local registry.[/yellow]")
        return

    registry = json.loads(REGISTRY_FILE.read_text())
    table = Table(title="Deployed Legal Documents (Local Registry)")
    table.add_column("Document ID", style="cyan")
    table.add_column("Slug", style="magenta")
    table.add_column("Signing URL", style="green")
    table.add_column("Deployed At", style="gray")

    for d in registry:
        table.add_row(d["id"], d["slug"], d["url"], d.get("deployed_at", "N/A"))

    console.print(table)

@app.command("close")
def close_doc(slug: str = typer.Argument(..., help="Slug or Document ID to force close")):
    """Force close an active document slug so it can no longer be viewed or signed."""
    api_base, api_key, _, _ = get_config()
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    with console.status(f"[bold red]Closing document slug '{slug}'...[/bold red]"):
        try:
            r = requests.post(f"{api_base}/api/doc/{slug}/close", headers=headers, timeout=15)
            r.raise_for_status()
            res = r.json()
            console.print(f"[bold green]Success:[/bold green] {res.get('message')}")
        except requests.RequestException as e:
            console.print(f"[bold red]Failed to close document slug:[/bold red] {e}")
            raise typer.Exit(code=1)

@app.command()
def pdf(
    json_path: Path = typer.Argument(..., help="Path to submission JSON file (downloaded from R2 or export)"),
    spec_path: Path = typer.Option(Path("my-nda.yaml"), "--spec", "-s", help="Path to document YAML spec to render full contract clauses"),
    output: Path = typer.Option(Path("executed-agreement.pdf"), "--output", "-o", help="Output PDF file path")
):
    """Convert an R2 submission JSON record into an official, court-grade PDF legal certificate."""
    import base64
    import io
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    if not json_path.exists():
        console.print(f"[bold red]Error:[/bold red] JSON file {json_path} does not exist.")
        raise typer.Exit(code=1)

    data = json.loads(json_path.read_text())

    # Handle single submission or wrapper object
    sub = data.get("submission", data)
    
    doc_id = sub.get("document_id", "N/A")
    sub_id = sub.get("submission_id", sub.get("id", "N/A"))
    email = sub.get("email", "N/A")
    audit_hash = sub.get("audit_hash", "N/A")
    submitted_at = sub.get("submitted_at", 0)
    time_str = datetime.fromtimestamp(submitted_at).strftime('%Y-%m-%d %H:%M:%S UTC') if submitted_at else "N/A"
    
    fields = sub.get("fields", {})
    if isinstance(fields, str):
        try: fields = json.loads(fields)
        except Exception: fields = {}

    sig_data = sub.get("signature") or sub.get("signature_svg") or ""

    pdf_doc = SimpleDocTemplate(
        str(output),
        pagesize=letter,
        rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        alignment=1,
        textColor=colors.HexColor('#0f172a')
    )
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=10,
        leading=14,
        alignment=1,
        textColor=colors.HexColor('#475569')
    )
    header_label_style = ParagraphStyle(
        'HeaderLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        textColor=colors.HexColor('#0f172a')
    )
    cell_style = ParagraphStyle(
        'CellText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        textColor=colors.HexColor('#334155')
    )
    hash_style = ParagraphStyle(
        'HashText',
        parent=styles['Normal'],
        fontName='Courier-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor('#1e3a8a')
    )

    story = []

    # Parse spec if available
    spec_data = sub.get("spec")
    if not spec_data and spec_path and spec_path.exists():
        try: spec_data = yaml.safe_load(spec_path.read_text())
        except Exception: spec_data = None

    doc_title = "OFFICIAL EXECUTED LEGAL INSTRUMENT"
    jurisdiction = ""
    legal_footer = ""
    sections = []

    if isinstance(spec_data, dict):
        doc_title = spec_data.get("document", {}).get("title", doc_title).upper()
        jurisdiction = spec_data.get("document", {}).get("jurisdiction", "")
        legal_footer = spec_data.get("document", {}).get("legal_footer", "")
        sections = spec_data.get("sections", [])

    # Document Header Title
    story.append(Paragraph(doc_title, title_style))
    if jurisdiction:
        story.append(Spacer(1, 2))
        story.append(Paragraph(f"Jurisdiction: {jurisdiction}", subtitle_style))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#0f172a'), spaceAfter=15))

    # Render Contract Body Clauses if spec is present
    if sections:
        body_style = ParagraphStyle(
            'DocBody',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9.5,
            leading=14,
            textColor=colors.HexColor('#1e293b')
        )
        h2_style = ParagraphStyle(
            'DocH2',
            parent=styles['Heading2'],
            fontName='Helvetica-Bold',
            fontSize=11,
            leading=15,
            textColor=colors.HexColor('#0f172a'),
            spaceBefore=10,
            spaceAfter=5
        )

        for sec in sections:
            sec_type = sec.get("type")
            if sec_type == "static":
                content = sec.get("content", "")
                for line in content.split("\n"):
                    line = line.strip()
                    if not line: continue
                    if line.startswith("## "):
                        story.append(Paragraph(line.replace("## ", ""), h2_style))
                    elif line.startswith("# "):
                        story.append(Paragraph(line.replace("# ", ""), title_style))
                    else:
                        story.append(Paragraph(line, body_style))
                        story.append(Spacer(1, 4))
            elif sec_type == "form":
                form_rows = []
                for f in sec.get("fields", []):
                    fname = f.get("name")
                    flabel = f.get("label", fname)
                    val = fields.get(fname, f.get("value", ""))
                    form_rows.append([Paragraph(str(flabel), header_label_style), Paragraph(str(val), cell_style)])
                if form_rows:
                    story.append(Spacer(1, 6))
                    ftable = Table(form_rows, colWidths=[180, 350])
                    ftable.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f8fafc')),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                        ('PADDING', (0, 0), (-1, -1), 5),
                    ]))
                    story.append(ftable)
                    story.append(Spacer(1, 10))

    else:
        # Fallback metadata table if spec not provided
        table_data = [
            [Paragraph("Document ID", header_label_style), Paragraph(str(doc_id), cell_style)],
            [Paragraph("Submission ID", header_label_style), Paragraph(str(sub_id), cell_style)],
            [Paragraph("Execution UTC Timestamp", header_label_style), Paragraph(str(time_str), cell_style)],
            [Paragraph("Signer Email", header_label_style), Paragraph(str(email), cell_style)]
        ]

        for k, v in fields.items():
            table_data.append([Paragraph(str(k), header_label_style), Paragraph(str(v), cell_style)])

        t = Table(table_data, colWidths=[180, 350])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f8fafc')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
            ('PADDING', (0, 0), (-1, -1), 6),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(t)
        story.append(Spacer(1, 15))

    # Signature Block & Legal Footer
    story.append(Spacer(1, 15))
    if legal_footer:
        footer_style = ParagraphStyle(
            'FooterText',
            parent=styles['Normal'],
            fontName='Helvetica-Oblique',
            fontSize=8.5,
            leading=12,
            textColor=colors.HexColor('#475569')
        )
        story.append(Paragraph(legal_footer, footer_style))
        story.append(Spacer(1, 10))

    # Signature Image & Metadata Table
    sig_meta = [
        [Paragraph("Execution UTC Timestamp", header_label_style), Paragraph(str(time_str), cell_style)],
        [Paragraph("Signer Email", header_label_style), Paragraph(str(email), cell_style)],
        [Paragraph("Submission ID", header_label_style), Paragraph(str(sub_id), cell_style)],
        [Paragraph("Cryptographic Audit SHA-256 Digest", header_label_style), Paragraph(str(audit_hash), hash_style)]
    ]

    sig_table = Table(sig_meta, colWidths=[180, 350])
    sig_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f8fafc')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(sig_table)
    story.append(Spacer(1, 15))

    if sig_data and ',' in sig_data:
        try:
            b64_str = sig_data.split(',', 1)[1]
            img_bytes = base64.b64decode(b64_str)
            img_buf = io.BytesIO(img_bytes)
            sig_img = Image(img_buf, width=220, height=80)
            
            story.append(Paragraph("SIGNATURE OF RECORD", header_label_style))
            story.append(Spacer(1, 4))
            story.append(sig_img)
            story.append(Spacer(1, 10))
        except Exception as img_err:
            console.print(f"[dim yellow]Notice: Could not render embedded signature image: {img_err}[/dim yellow]")

    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#cbd5e1'), spaceBefore=10, spaceAfter=10))
    story.append(Paragraph("Legally Binding Advanced Electronic Signature (eIDAS Regulation EU No 910/2014 & US ESIGN Act)", subtitle_style))

    pdf_doc.build(story)
    console.print(f"[bold green]Successfully generated court-grade PDF certificate:[/bold green] {output.resolve()}")

if __name__ == "__main__":
    app()

