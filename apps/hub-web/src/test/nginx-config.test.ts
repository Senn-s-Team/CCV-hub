/**
 * [INPUT]: 依赖 vitest、node:fs 与 hub-web nginx.conf
 * [OUTPUT]: 对外提供静态 assets miss 不回退 SPA HTML 的 nginx 配置回归测试
 * [POS]: hub-web 测试集的边缘入口守卫，防止 hashed module stale cache 被 index.html 吞掉后触发 MIME 错误
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const hubWebDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const nginxConfig = readFileSync(join(hubWebDir, 'nginx.conf'), 'utf8');

describe('nginx static asset routing', () => {
  it('returns 404 for missing hashed assets instead of SPA HTML', () => {
    expect(nginxConfig).toMatch(/location\s+\/assets\/\s*\{[^}]*try_files\s+\$uri\s+=404;/su);
  });
});
