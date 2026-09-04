// 개발 환경의 브라우저 확인용 서버입니다. 학생용 실행에는 Node/npm이 필요 없습니다.
// 실제 앱 파일은 physics-playground-3d 폴더의 순수 HTML/CSS/JS입니다.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('./physics-playground-3d/', import.meta.url));
const qaRoot = fileURLToPath(new URL('./qa/', import.meta.url));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 4173;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const base = pathname.startsWith('/__qa/') ? qaRoot : root;
    const relative = pathname.startsWith('/__qa/') ? pathname.slice(5) : pathname;
    const target = path.resolve(base, '.' + (relative === '/' ? '/index.html' : relative));
    if (!target.startsWith(base) || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(403); response.end(); return;
    }
    const body = await fs.readFile(target);
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('파일을 찾을 수 없습니다.');
  }
}).listen(port, '0.0.0.0', () => console.log(`Preview server ready on port ${port}`));
