#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""无缓存静态文件服务器，供 demo 预览/验证使用。python tools/serve_nocache.py [port]"""
import sys, http.server, socketserver
from http.server import SimpleHTTPRequestHandler

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899

class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, *a):
        pass

class S(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

if __name__ == '__main__':
    import os
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    with S(('127.0.0.1', PORT), H) as httpd:
        print(f'serving on http://127.0.0.1:{PORT}', flush=True)
        httpd.serve_forever()
