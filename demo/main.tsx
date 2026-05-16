/**
 * Demo 入口 — 真实 Smartbi 后端联调演示
 *
 * 启动:`npm run dev`(并行启 vite:5173 + proxy:3100),浏览器开 http://localhost:5173
 *
 * 配置存于 [proxy/configs.json](../proxy/configs.json) — 顶部 UI 增删改查;
 * 实际写文件由 proxy/server.js 完成。
 *
 * UI 结构:
 *   - 有效 metadata → 渲染 PivotTable,配置切换器 (SmartbiConfigManager) 通过
 *     `headerTrailing` prop 注入到 PivotTable 工具栏的 trailing 槽(最右),
 *     刷新/导出/明细/图表/设置 在中间组
 *   - 无效状态(配置不存在 / metadata 加载中 / 加载失败 / 缺 modelId)→ 渲染一个
 *     fallback 工具栏(只放配置切换器),下方显示状态消息
 *
 *   两条路径共享同一个 SmartbiConfigManager 实例(逻辑等价),保证用户随时能切换配置。
 */
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { PivotTable } from '../src/components/PivotTable/PivotTable.js';
import { SmartbiClient } from '../src/api/smartbi/SmartbiClient.js';
import { buildMemberQuery } from '../src/core/queryBuilder/buildMemberQuery.js';
import { buildViewConfig } from '../src/fixtures/builders.js';
import type { Metadata } from '../src/types/metadata.js';
import { ModelPickerButton } from './ModelPickerButton.js';
import { SmartbiConfigManager, type SmartbiConfig } from './SmartbiConfigManager.js';

const ACTIVE_ID_KEY = 'smartbi-active-config-id';

function App() {
  const [configs, setConfigs] = useState<SmartbiConfig[]>([]);
  const [configsLoaded, setConfigsLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_ID_KEY) ?? null,
  );
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  // 启动时拉一次 configs
  useEffect(() => {
    fetch('/api/configs')
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/configs ${r.status}`);
        return r.json();
      })
      .then((list: SmartbiConfig[]) => {
        setConfigs(list);
        setConfigsLoaded(true);
        const stillExists = activeId && list.some((c) => c.id === activeId);
        if (!stillExists && list.length > 0) {
          setActiveId(list[0].id);
        } else if (list.length === 0) {
          setActiveId(null);
        }
      })
      .catch((e) => {
        setConfigsLoaded(true);
        setLoadError(e instanceof Error ? e : new Error(String(e)));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_ID_KEY, activeId);
  }, [activeId]);

  const activeConfig = useMemo(
    () => configs.find((c) => c.id === activeId) ?? null,
    [configs, activeId],
  );

  const client = useMemo(() => {
    if (!activeConfig) return null;
    return new SmartbiClient({
      // /proxy/<id> 走 vite → Express → 真后端;
      // 用户填的 baseUrl 只到 smartbi(context root),`/smartbix`(API namespace)由代码在这里拼。
      baseUrl: `/proxy/${activeConfig.id}/smartbix`,
      auth: { token: activeConfig.token || 'dummy' }, // 实际 token 由 proxy 注入,前端给个非空占位即可
      smxEncode: false,
    });
  }, [activeConfig]);

  useEffect(() => {
    if (!client || !activeConfig?.modelId) {
      setMetadata(null);
      return;
    }
    setMetadata(null);
    setLoadError(null);
    client
      .fetchMetadata(activeConfig.modelId)
      .then((md) => {
        setMetadata(md);
        // 老 config 只有 modelId 没 modelName(picker UI 显示"未命名模型"很丑)
        // → metadata.alias / .name 已经是数据集别名,静默回填一下
        const friendly = md.alias || md.name;
        if (friendly && !activeConfig.modelName) {
          const patched: SmartbiConfig = { ...activeConfig, modelName: friendly };
          setConfigs((cs) => cs.map((c) => (c.id === activeConfig.id ? patched : c)));
          fetch(`/api/configs/${activeConfig.id}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patched),
          }).catch((e) => console.warn('[modelName backfill] PUT failed (ignored)', e));
        }
      })
      .catch((e) => setLoadError(e instanceof Error ? e : new Error(String(e))));
  }, [client, activeConfig?.modelId]);

  // 成员选择器:把 field 当作单独的 row 跑一次查询取 distinct 成员
  const loadMembers = async (field: string): Promise<string[]> => {
    if (!client || !metadata) return [];
    const query = buildMemberQuery(field, metadata, { pageSize: 1000 });
    const cellSet = await client.executeQuery(query);
    const set = new Set<string>();
    for (const row of cellSet.rows) {
      const m = row[0];
      if (m?.name) set.add(m.name);
    }
    return Array.from(set);
  };

  // 切模型 → PUT /api/configs/:id 持久化 modelId+modelName,主程序自动重拉 metadata
  // (依赖链:configs state 变 → activeConfig 重算 → useEffect 依赖 modelId 变 → fetchMetadata)
  async function handleModelPick(model: { id: string; name: string; aliasPath: string }) {
    if (!activeConfig) return;
    const next: SmartbiConfig = {
      ...activeConfig,
      modelId: model.id,
      modelName: model.aliasPath || model.name,
    };
    // 乐观更新:先改本地 state,后端 PUT 失败再回滚
    const before = configs;
    setConfigs((cs) => cs.map((c) => (c.id === activeConfig.id ? next : c)));
    try {
      const res = await fetch(`/api/configs/${activeConfig.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error(`PUT /api/configs/${activeConfig.id} ${res.status}`);
    } catch (e) {
      console.error('[ModelPicker] save failed, rolling back', e);
      setConfigs(before);
    }
  }

  const configManager = (
    <SmartbiConfigManager
      configs={configs}
      activeId={activeId}
      onActiveChange={setActiveId}
      onConfigsChange={setConfigs}
    />
  );

  // 数据模型 picker 按钮 — 跟 configManager 并排放在 trailing 槽
  const modelPickerButton = (
    <ModelPickerButton
      client={client}
      currentModelId={activeConfig?.modelId ?? ''}
      currentModelName={activeConfig?.modelName}
      onPick={handleModelPick}
    />
  );


  // 主路径:数据齐全 → 渲染 PivotTable,配置切换器进它的 toolbar leading 槽
  const ready = configsLoaded && activeConfig && client && metadata && !loadError;
  if (ready) {
    return (
      <PivotTable
        // 切换配置/模型时整个 PivotTable remount(避免旧 viewConfig 字段名落到新 metadata 上)
        key={`${activeConfig.id}::${activeConfig.modelId}`}
        metadata={metadata}
        defaultValue={buildViewConfig({})}
        onQuery={client.asOnQuery()}
        loadMembers={loadMembers}
        headerTrailing={configManager}
        dataPanelTrailing={modelPickerButton}
      />
    );
  }

  // Fallback 路径:数据未齐 → 自己渲一个最小工具栏(放配置切换器)+ 状态消息
  // 此时还没 ready,数据面板不渲染,modelPickerButton 暂时显示在 trailing 槽给用户操作
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div className="toolbar">
        <div className="toolbar__leading" />
        <div className="toolbar__center" />
        <div className="toolbar__trailing">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {modelPickerButton}
            {configManager}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{renderFallbackBody()}</div>
    </div>
  );

  function renderFallbackBody() {
    if (!configsLoaded) return <Hint>加载配置中…</Hint>;
    if (loadError) {
      return (
        <Hint>
          <strong>加载失败:</strong>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{loadError.message}</pre>
        </Hint>
      );
    }
    if (configs.length === 0) {
      return (
        <Hint>
          <strong>请先在顶部"🌐 ⌄"按钮里点"+ 新增配置"添加 Smartbi 配置。</strong>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>
            配置会持久化到 <code>proxy/configs.json</code>(已加 .gitignore)
          </p>
        </Hint>
      );
    }
    if (!activeConfig) return <Hint>请在顶部选择一个配置</Hint>;
    if (!activeConfig.modelId) {
      return (
        <Hint>
          配置 <strong>{activeConfig.name}</strong> 还没选数据模型。
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>
            点顶部"📊 选择数据模型…"按钮浏览资源目录并选一个。
          </p>
        </Hint>
      );
    }
    return <Hint>加载 metadata 中…</Hint>;
  }
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 40, fontSize: 14, lineHeight: 1.6 }}>{children}</div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
