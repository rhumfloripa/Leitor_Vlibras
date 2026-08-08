#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Servidor local para testar a aplicacao Vimeo + VLibras.
Roda em http://localhost:8000 e abre o navegador automaticamente.

Como usar:
    python servidor.py
Depois, no navegador, acesse:  http://localhost:8000/index.html
Para parar: Ctrl+C
"""
import http.server
import socketserver
import webbrowser
import os
import threading

PORT = 8000
ARQUIVO = "index.html"

# serve a partir da pasta onde este script esta
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    # Cabecalhos que ajudam scripts de terceiros a carregarem sem travas
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, fmt, *args):
        # log enxuto
        print("  >", self.address_string(), "-", fmt % args)

def abrir_navegador():
    url = f"http://localhost:{PORT}/{ARQUIVO}"
    print(f"\n  Abrindo no navegador: {url}\n")
    webbrowser.open(url)

if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print("=" * 56)
        print(f"  Servidor local rodando em http://localhost:{PORT}")
        print(f"  Aplicacao:  http://localhost:{PORT}/{ARQUIVO}")
        print("  Para parar: Ctrl+C")
        print("=" * 56)
        # abre o navegador logo apos subir o servidor
        threading.Timer(0.8, abrir_navegador).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Servidor encerrado. Ate mais!")
