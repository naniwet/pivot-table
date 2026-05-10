/**
 * Smartbi 配置代理 — 单人本地开发工具
 *
 * 范围:
 *   - GET    /api/configs           列出所有 Smartbi 配置(读 configs.json)
 *   - POST   /api/configs           新增配置(server 生成 id,写 configs.json)
 *   - PUT    /api/configs/:id       修改配置(覆盖式,id 不变)
 *   - DELETE /api/configs/:id       删除配置
 *   - *      /proxy/:configId/...   按 configId 反代到 config.baseUrl,自动注入 token
 *
 * 设计:
 *   - 状态全在 configs.json,server 不持有内存态(每次请求 re-read)。
 *     单人单机用,configs 体积极小,re-read 比加 chokidar 简单。
 *   - 不做鉴权:仅监听 127.0.0.1,假设单人本地用。任何在公网/团队网络暴露
 *     此进程的人,等同把所有 token 公开 — 不要这么做。
 *   - 反代 middleware 按请求 lazy 创建,target 固定到当前 configId 对应的 baseUrl
 *
 * Trade-off / 反悔成本:
 *   - 没鉴权 → 中等反悔成本(以后想多用户用,得加 basic-auth + HTTPS,改动局限在本文件)
 *   - re-read on every request → 轻易可逆,加缓存 / chokidar 监听都行
 *
 * 启动:`npm run dev:proxy`(端口 3100)
 *      或 `npm run dev`(并行启 vite + proxy)
 */
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, 'configs.json');

// ---- Config CRUD(纯 IO,无业务逻辑)----

function loadConfigs() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(`[proxy] ${CONFIG_FILE} root is not an array — treating as empty`);
      return [];
    }
    return parsed;
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

function saveConfigs(configs) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2) + '\n');
}

function findConfig(id) {
  return loadConfigs().find((c) => c.id === id) ?? null;
}

function normalizeBaseUrl(url) {
  // baseUrl 末尾 / 去掉,避免与请求路径拼接时出现 //api
  return String(url).replace(/\/+$/, '');
}

// ---- Express ----

const app = express();

// JSON body parser **只挂在 /api/* 路径**,不能用 app.use(...) 全局挂!
// 原因:全局挂的话 /proxy/* 的 POST body 也会被它消耗(body 流读完就没了),
//       然后 http-proxy-middleware 转发时 body=空 → Smartbi 收到空 PivotQuery 返 406。
// 这是 http-proxy-middleware 经典坑,见:
//   https://github.com/chimurai/http-proxy-middleware/blob/master/recipes/modify-post.md
app.use('/api', express.json({ limit: '1mb' }));

// CRUD 必须先于 /proxy 注册,否则会被通配吃掉

app.get('/api/configs', (_req, res) => {
  res.json(loadConfigs());
});

app.post('/api/configs', (req, res) => {
  const { name, baseUrl, token, modelId } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name (string) is required' });
  }
  if (!baseUrl || typeof baseUrl !== 'string') {
    return res.status(400).json({ error: 'baseUrl (string) is required' });
  }
  const config = {
    id: randomUUID(),
    name: name.trim(),
    baseUrl: normalizeBaseUrl(baseUrl),
    token: typeof token === 'string' ? token : '',
    modelId: typeof modelId === 'string' ? modelId : '',
  };
  const configs = loadConfigs();
  configs.push(config);
  saveConfigs(configs);
  res.status(201).json(config);
});

app.put('/api/configs/:id', (req, res) => {
  const configs = loadConfigs();
  const idx = configs.findIndex((c) => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'config not found' });

  const current = configs[idx];
  const { name, baseUrl, token, modelId } = req.body ?? {};
  const updated = {
    id: current.id, // id 不可改
    name: typeof name === 'string' ? name.trim() : current.name,
    baseUrl: typeof baseUrl === 'string' ? normalizeBaseUrl(baseUrl) : current.baseUrl,
    token: typeof token === 'string' ? token : current.token,
    modelId: typeof modelId === 'string' ? modelId : current.modelId,
  };
  configs[idx] = updated;
  saveConfigs(configs);
  res.json(updated);
});

app.delete('/api/configs/:id', (req, res) => {
  const configs = loadConfigs();
  const next = configs.filter((c) => c.id !== req.params.id);
  if (next.length === configs.length) {
    return res.status(404).json({ error: 'config not found' });
  }
  saveConfigs(next);
  res.status(204).end();
});

// ---- 反代 ----
//
// 路径形态:  /proxy/<configId>/<rest>
// 转发到:    <config.baseUrl>/<rest>
// 例:
//   /proxy/abc/api/augmentedDataSet/xxx
//   → <config.baseUrl>/api/augmentedDataSet/xxx
//   (config.baseUrl 形如 http://your-host:port/smartbi/smartbix)
//
// http-proxy-middleware v3 在 app.use('/proxy/:id', ...) 挂载时,
// 自身不会自动 strip 挂载前缀,所以显式 pathRewrite 把 /proxy/<id> 删掉。

app.use('/proxy/:configId', (req, res, next) => {
  const config = findConfig(req.params.configId);
  if (!config) {
    return res.status(404).json({ error: `config not found: ${req.params.configId}` });
  }
  const prefix = `/proxy/${req.params.configId}`;
  return createProxyMiddleware({
    target: config.baseUrl,
    changeOrigin: true,
    secure: false,
    pathRewrite: (p) => {
      const stripped = p.startsWith(prefix) ? p.slice(prefix.length) : p;
      return stripped || '/';
    },
    on: {
      proxyReq: (proxyReq) => {
        if (config.token) {
          proxyReq.setHeader('Authorization', `Bearer ${config.token}`);
        }
      },
      error: (err, _req, _res) => {
        console.error(`[proxy] ${config.name} (${config.baseUrl}):`, err.message);
      },
    },
  })(req, res, next);
});

// 健康检查 — 让前端启动时能 detect proxy 是否在跑
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, configFile: CONFIG_FILE });
});

// ---- Listen ----

const PORT = Number(process.env.PROXY_PORT ?? 3100);
const HOST = '127.0.0.1'; // 只听本地,公网/局域网都拒绝
app.listen(PORT, HOST, () => {
  console.log(`[proxy] listening on http://${HOST}:${PORT}`);
  console.log(`[proxy] config file: ${CONFIG_FILE}`);
  if (!fs.existsSync(CONFIG_FILE)) {
    console.log(`[proxy] (configs.json doesn't exist yet — will be created on first POST)`);
  }
});
