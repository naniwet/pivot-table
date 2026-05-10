/**
 * Probe 脚本共享 env 读取 — 缺必需变量直接 exit(1)。
 *
 * 用法:
 *   import { requireProbeEnv } from './lib/probeEnv.js';
 *   const { token: TOKEN, base: BASE, modelId: MODEL_ID } = requireProbeEnv();
 *
 * 跑法(用户本地需要 export):
 *   SMARTBI_TOKEN=st_xxx \
 *   SMARTBI_BASE=http://your-host:port/smartbi/smartbix \
 *   SMARTBI_MODEL_ID=your_model_id \
 *   npx tsx scripts/probe-baseline.ts
 *
 * 不在脚本里硬编码默认值 — 仓库公开,避免暴露具体后端地址 / 模型 ID。
 */
export function requireProbeEnv(): {
  token: string;
  base: string;
  modelId: string;
} {
  const token = (process.env.SMARTBI_TOKEN ?? '').trim();
  const base = (process.env.SMARTBI_BASE ?? '').trim();
  const modelId = (process.env.SMARTBI_MODEL_ID ?? '').trim();

  const missing = [
    !token && 'SMARTBI_TOKEN',
    !base && 'SMARTBI_BASE',
    !modelId && 'SMARTBI_MODEL_ID',
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    console.error(
      `Probe 脚本需要环境变量: ${missing.join(', ')}\n\n` +
        `跑法示例:\n` +
        `  SMARTBI_TOKEN=st_xxx \\\n` +
        `  SMARTBI_BASE=http://your-host:port/smartbi/smartbix \\\n` +
        `  SMARTBI_MODEL_ID=your_model_id \\\n` +
        `  npx tsx scripts/probe-baseline.ts\n`,
    );
    process.exit(1);
  }

  return { token, base, modelId };
}
