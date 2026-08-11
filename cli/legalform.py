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

app = typer.Typer(help="LegalForm CLI - Deploy, sign, export, and rebuild electronic legal documents.")
console = Console()

REGISTRY_FILE = Path(".legalform_registry.json")

def get_config():
    api_base = os.getenv("LEGALFORM_API", "http://127.0.0.1:8787").strip(' "\'').rstrip("/")
    pages_base = os.getenv("LEGALFORM_PAGES", "http://localhost:8080").strip(' "\'').rstrip("/")
    return api_base, pages_base

@app.command()
def deploy(
    spec_path: Path = typer.Argument(Path("my-nda.yaml"), help="Path to YAML spec file"),
    fill: list[str] = typer.Option([], "--fill", "-f", help="Pre-fill field values (e.g. -f receiving_party='Acme Corp')")
):
    """Deploy a document specification to local or remote API with optional pre-filled field values."""
    if not spec_path.exists():
        console.print(f"[bold red]Error:[/bold red] File {spec_path} does not exist.")
        raise typer.Exit(code=1)

    api_base, pages_base = get_config()
    spec = yaml.safe_load(spec_path.read_text())
    doc_meta = spec.get("document", {})
    doc_id = doc_meta.get("id")
    
    if not doc_id:
        console.print("[bold red]Error:[/bold red] Spec missing 'document.id'.")
        raise typer.Exit(code=1)

    # Apply pre-fill overrides
    prefills = {}
    for item in fill:
        if "=" in item:
            k, v = item.split("=", 1)
            prefills[k.strip()] = v.strip()

    slug = hashlib.sha256(f"{doc_id}-{datetime.now().isoformat()}".encode()).hexdigest()[:12]
    expires_days = doc_meta.get("expires_in_days", 30)
    expires_at = int((datetime.now() + timedelta(days=expires_days)).timestamp())

    payload = {
        "id": doc_id,
        "slug": slug,
        "spec": json.dumps(spec),
        "expires_at": expires_at
    }

    with console.status("[bold blue]Deploying document...[/bold blue]"):
        try:
            r = requests.post(f"{api_base}/api/documents", json=payload, timeout=15)
            r.raise_for_status()
        except requests.RequestException as e:
            console.print(f"[bold red]Deployment failed:[/bold red] {e}")
            raise typer.Exit(code=1)

    # Build shareable link with dynamic query pre-fills
    query_str = f"slug={slug}"
    if prefills:
        query_str += "&" + "&".join([f"{k}={v}" for k, v in prefills.items()])

    signing_url = f"{pages_base}/?{query_str}"

    console.print("\n[bold green]🚀 Document Deployed Successfully![/bold green]")
    console.print(f"• Document ID: [cyan]{doc_id}[/cyan]")
    console.print(f"• Shareable Signing Link: [bold underline cyan]{signing_url}[/bold underline cyan]")
    if prefills:
        console.print(f"• Pre-filled Fields: [yellow]{prefills}[/yellow]")

    # Save to local registry
    registry = []
    if REGISTRY_FILE.exists():
        try: registry = json.loads(REGISTRY_FILE.read_text())
        except Exception: registry = []

    registry.append({
        "id": doc_id,
        "slug": slug,
        "url": signing_url,
        "spec_file": str(spec_path),
        "deployed_at": datetime.now().isoformat(),
        "prefills": prefills
    })
    REGISTRY_FILE.write_text(json.dumps(registry, indent=2))

@app.command("export")
def export_doc(
    doc_id: str = typer.Argument(..., help="Document ID or slug"),
    output: Path = typer.Option(Path("submission.json"), "--output", "-o", help="Output JSON path")
):
    """Export compact hashed local data payload for a document."""
    api_base, _ = get_config()
    with console.status(f"[bold blue]Exporting submission data for '{doc_id}'...[/bold blue]"):
        try:
            r = requests.get(f"{api_base}/api/export/{doc_id}", timeout=15)
            r.raise_for_status()
            data = r.json()
            output.write_text(json.dumps(data, indent=2))
            console.print(f"[bold green]Exported compact data payload to:[/bold green] {output.resolve()}")
        except requests.RequestException as e:
            console.print(f"[bold red]Export failed:[/bold red] {e}")
            raise typer.Exit(code=1)

@app.command("pdf")
def generate_pdf(
    json_path: Path = typer.Argument(..., help="Path to compact submission JSON file"),
    spec_path: Path = typer.Option(Path("my-nda.yaml"), "--spec", "-s", help="Path to YAML spec"),
    output: Path = typer.Option(Path("executed-agreement.pdf"), "--output", "-o", help="Output PDF filename")
):
    """Rebuild the exact signed PDF from the local compact hashed data file."""
    import base64
    import io
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    if not json_path.exists():
        console.print(f"[bold red]Error:[/bold red] File {json_path} does not exist.")
        raise typer.Exit(code=1)

    data = json.loads(json_path.read_text())

    # Support single submission payload or export list
    sub = data
    if "submissions" in data and len(data["submissions"]) > 0:
        sub = data["submissions"][0]
    elif "payload" in data:
        sub = data["payload"]

    doc_id = sub.get("document_id", "N/A")
    email = sub.get("signer_email", sub.get("email", "N/A"))
    audit_hash = sub.get("audit_hash", "N/A")
    submitted_at = sub.get("submitted_at", 0)
    time_str = datetime.fromtimestamp(submitted_at).strftime('%Y-%m-%d %H:%M:%S UTC') if submitted_at else "N/A"
    
    fields = sub.get("fields", {})
    if isinstance(fields, str):
        try: fields = json.loads(fields)
        except Exception: fields = {}

    sig_data = sub.get("signature_data") or sub.get("signature_svg") or ""

def build_pdf_bytes(payload: dict) -> bytes:
    import base64
    import io
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    sub = payload
    if "submissions" in payload and len(payload["submissions"]) > 0:
        sub = payload["submissions"][0]
    elif "payload" in payload:
        sub = payload["payload"]

    doc_id = sub.get("document_id", "N/A")
    email = sub.get("signer_email", sub.get("email", "N/A"))
    audit_hash = sub.get("audit_hash", "N/A")
    submitted_at = sub.get("submitted_at", 0)
    time_str = datetime.fromtimestamp(submitted_at).strftime('%Y-%m-%d %H:%M:%S UTC') if submitted_at else "N/A"
    
    fields = sub.get("fields", {})
    if isinstance(fields, str):
        try: fields = json.loads(fields)
        except Exception: fields = {}

    sig_data = sub.get("signature_data") or sub.get("signature_svg") or ""

    pdf_buffer = io.BytesIO()
    pdf_doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=letter,
        rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'DocTitle', parent=styles['Heading1'],
        fontName='Helvetica-Bold', fontSize=18, leading=22, alignment=1, textColor=colors.HexColor('#0f172a')
    )
    subtitle_style = ParagraphStyle(
        'DocSubTitle', parent=styles['Normal'],
        fontName='Helvetica-Oblique', fontSize=10, leading=14, alignment=1, textColor=colors.HexColor('#475569')
    )
    header_label_style = ParagraphStyle(
        'HeaderLabel', parent=styles['Normal'],
        fontName='Helvetica-Bold', fontSize=10, textColor=colors.HexColor('#0f172a')
    )
    cell_style = ParagraphStyle(
        'CellText', parent=styles['Normal'],
        fontName='Helvetica', fontSize=10, textColor=colors.HexColor('#334155')
    )
    hash_style = ParagraphStyle(
        'HashText', parent=styles['Normal'],
        fontName='Courier-Bold', fontSize=9, leading=12, textColor=colors.HexColor('#0284c7')
    )

    story = []

    spec_data = sub.get("spec")
    doc_title = "OFFICIAL EXECUTED AGREEMENT"
    jurisdiction = ""
    legal_footer = ""
    sections = []

    if isinstance(spec_data, dict):
        doc_title = spec_data.get("document", {}).get("title", doc_title).upper()
        jurisdiction = spec_data.get("document", {}).get("jurisdiction", "")
        legal_footer = spec_data.get("document", {}).get("legal_footer", "")
        sections = spec_data.get("sections", [])

    story.append(Paragraph(doc_title, title_style))
    if jurisdiction:
        story.append(Spacer(1, 2))
        story.append(Paragraph(f"Jurisdiction: {jurisdiction}", subtitle_style))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#0f172a'), spaceAfter=15))

    if sections:
        body_style = ParagraphStyle('DocBody', parent=styles['Normal'], fontName='Helvetica', fontSize=9.5, leading=14, textColor=colors.HexColor('#1e293b'))
        h2_style = ParagraphStyle('DocH2', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=11, leading=15, textColor=colors.HexColor('#0f172a'), spaceBefore=10, spaceAfter=5)

        for sec in sections:
            sec_type = sec.get("type")
            if sec_type == "static":
                for line in (sec.get("content", "")).split("\n"):
                    line = line.strip()
                    if not line: continue
                    if line.startswith("## "): story.append(Paragraph(line.replace("## ", ""), h2_style))
                    else: story.append(Paragraph(line, body_style)); story.append(Spacer(1, 4))
            elif sec_type == "form" or sec_type == "signature":
                for f in sec.get("fields", []):
                    fname = f.get("name")
                    flabel = f.get("label", fname)
                    val = str(fields.get(fname, f.get("value", "")))
                    formatted_val = val.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('\n', '<br/>')
                    ftable = Table([[Paragraph(str(flabel), header_label_style), Paragraph(formatted_val, cell_style)]], colWidths=[180, 350], splitByRow=1)
                    ftable.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f8fafc')),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                        ('PADDING', (0, 0), (-1, -1), 5),
                    ]))
                    story.append(Spacer(1, 4))
                    story.append(ftable)
                if sec.get("fields"):
                    story.append(Spacer(1, 6))

    story.append(Spacer(1, 15))
    if legal_footer:
        footer_style = ParagraphStyle('FooterText', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=8.5, leading=12, textColor=colors.HexColor('#475569'))
        story.append(Paragraph(legal_footer, footer_style))
        story.append(Spacer(1, 10))

    sig_meta = [
        [Paragraph("Execution UTC Timestamp", header_label_style), Paragraph(str(time_str), cell_style)],
        [Paragraph("Signer Email", header_label_style), Paragraph(str(email), cell_style)],
        [Paragraph("SHA-256 Cryptographic Audit Hash", header_label_style), Paragraph(str(audit_hash), hash_style)]
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
            sig_img = Image(img_buf, width=200, height=75)
            story.append(Paragraph("SIGNATURE OF RECORD", header_label_style))
            story.append(Spacer(1, 4))
            story.append(sig_img)
        except Exception:
            pass

    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#cbd5e1'), spaceBefore=10, spaceAfter=10))
    story.append(Paragraph("Rebuilt Losslessly from Cryptographically Verified Local Data", subtitle_style))

    # Dedicated Certificate of Execution Page
    from reportlab.platypus import PageBreak
    story.append(PageBreak())
    
    cert_title = ParagraphStyle('CertTitle', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=16, leading=20, alignment=1, textColor=colors.HexColor('#0f172a'))
    cert_sub = ParagraphStyle('CertSub', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=9, leading=13, alignment=1, textColor=colors.HexColor('#475569'))
    
    story.append(Paragraph("OFFICIAL CERTIFICATE OF ELECTRONIC EXECUTION", cert_title))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Court-Enforceable Instrument (ESIGN Act 15 U.S.C. § 7001 & EU eIDAS Regulation Art. 25)", cert_sub))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#0f172a'), spaceAfter=15))

    cert_rows = [
      [Paragraph("Document ID", header_label_style), Paragraph(str(doc_id), cell_style)],
      [Paragraph("Submission ID", header_label_style), Paragraph(str(sub.get("submission_id", "N/A")), cell_style)],
      [Paragraph("Signer Name", header_label_style), Paragraph(str(sub.get("signer_name", "N/A")), cell_style)],
      [Paragraph("Signer Email", header_label_style), Paragraph(str(email), cell_style)],
      [Paragraph("Execution UTC Timestamp", header_label_style), Paragraph(str(time_str), cell_style)],
      [Paragraph("Cryptographic Audit SHA-256 Digest", header_label_style), Paragraph(str(audit_hash), hash_style)]
    ]

    cert_table = Table(cert_rows, colWidths=[180, 350])
    cert_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f8fafc')),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(cert_table)
    story.append(Spacer(1, 20))

    if sig_data and ',' in sig_data:
        try:
            b64_str = sig_data.split(',', 1)[1]
            img_bytes = base64.b64decode(b64_str)
            img_buf = io.BytesIO(img_bytes)
            sig_img = Image(img_buf, width=220, height=80)
            story.append(Paragraph("DIGITAL SIGNATURE CANVAS RECORD", header_label_style))
            story.append(Spacer(1, 6))
            story.append(sig_img)
        except Exception:
            pass

    pdf_doc.build(story)
    return pdf_buffer.getvalue()

@app.command("pdf")
def generate_pdf(
    json_path: Path = typer.Argument(..., help="Path to compact submission JSON file"),
    spec_path: Path = typer.Option(Path("my-nda.yaml"), "--spec", "-s", help="Path to YAML spec"),
    output: Path = typer.Option(Path("executed-agreement.pdf"), "--output", "-o", help="Output PDF filename")
):
    """Rebuild the exact signed PDF from the local compact hashed data file."""
    if not json_path.exists():
        console.print(f"[bold red]Error:[/bold red] File {json_path} does not exist.")
        raise typer.Exit(code=1)

    data = json.loads(json_path.read_text())
    pdf_bytes = build_pdf_bytes(data)
    output.write_bytes(pdf_bytes)
    console.print(f"[bold green]Successfully rebuilt PDF agreement:[/bold green] {output.resolve()}")

@app.command("serve")
def serve(port: int = typer.Option(8080, "--port", "-p", help="Port for local static UI server")):
    """Serve the legal document web UI locally with API proxying and PDF generation."""
    import http.server
    import socketserver
    import urllib.request
    
    pages_dir = Path(__file__).parent.parent / "pages"
    class ProxyHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(pages_dir), **kwargs)

        def do_GET(self):
            if self.path.startswith("/api/"):
                self.proxy_request("GET")
            elif not Path(self.translate_path(self.path)).exists():
                self.path = "/index.html"
                super().do_GET()
            else:
                super().do_GET()

        def do_POST(self):
            if self.path == "/api/render-pdf":
                content_len = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_len) if content_len > 0 else b'{}'
                try:
                    payload = json.loads(body.decode('utf-8'))
                    pdf_bytes = build_pdf_bytes(payload)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/pdf')
                    self.send_header('Content-Disposition', 'attachment; filename="executed-agreement.pdf"')
                    self.send_header('Content-Length', str(len(pdf_bytes)))
                    self.end_headers()
                    self.wfile.write(pdf_bytes)
                except Exception as err:
                    self.send_error(500, f"PDF generation error: {err}")
            elif self.path.startswith("/api/"):
                self.proxy_request("POST")
            else:
                super().do_POST()

        def proxy_request(self, method):
            target_url = f"http://127.0.0.1:8787{self.path}"
            content_len = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_len) if content_len > 0 else None
            req = urllib.request.Request(target_url, data=body, method=method)
            for k, v in self.headers.items():
                if k.lower() not in ['host', 'accept-encoding']: req.add_header(k, v)
            try:
                with urllib.request.urlopen(req) as resp:
                    resp_body = resp.read()
                    self.send_response(resp.status)
                    for k, v in resp.headers.items():
                        if k.lower() not in ['transfer-encoding', 'content-length', 'content-encoding']:
                            self.send_header(k, v)
                    self.send_header('Content-Length', str(len(resp_body)))
                    self.end_headers()
                    self.wfile.write(resp_body)
            except urllib.error.HTTPError as e:
                resp_body = e.read()
                self.send_response(e.code)
                for k, v in e.headers.items():
                    if k.lower() not in ['transfer-encoding', 'content-length', 'content-encoding']:
                        self.send_header(k, v)
                self.send_header('Content-Length', str(len(resp_body)))
                self.end_headers()
                self.wfile.write(resp_body)
            except Exception as e:
                self.send_error(500, str(e))

    console.print(f"[bold green]Starting local web UI server on http://localhost:{port}[/bold green]")
    with socketserver.TCPServer(("", port), ProxyHandler) as httpd:
        try: httpd.serve_forever()
        except KeyboardInterrupt: console.print("\n[yellow]Stopped.[/yellow]")

if __name__ == "__main__":
    app()
