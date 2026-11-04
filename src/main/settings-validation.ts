/**
 * 设置补丁校验（host 端 applySettingsPatch 前置）。
 *
 * 设计原则：
 * - 纯函数、无副作用、可单测
 * - 只校验 patch 中出现的字段；未提供的字段按"保持原值"处理，不做强制
 * - 对"切换 provider 但缺配套参数"的组合给出中文友好错误，避免运行时才 401/404
 */

export type SettingsValidationResult =
  | { ok: true }
  | { ok: false; error: string };

const CHUNK_SIZE_MIN = 1;
const CHUNK_SIZE_MAX = 20000;
const CHUNK_OVERLAP_MIN = 0;
const CHUNK_OVERLAP_MAX = 5000;
const CHUNK_MODES = new Set(['fixed', 'heading']);
const EMBEDDING_PROVIDERS = new Set(['local', 'openai', 'fallback']);
const RERANK_PROVIDERS = new Set(['local', 'openai', 'none']);

function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * 校验一次设置 patch 是否自洽。
 * 调用方应先把 patch 与当前设置合并（取"目标态"），再传入做整体校验。
 * 这里直接收"目标态 settings 的可校验字段子集"即可，未提供的字段跳过。
 */
export function validateSettingsPatch(patch: Record<string, any>): SettingsValidationResult {
  // ---- chunkSize / chunkOverlap / chunkMode ----
  if (patch.chunkSize !== undefined) {
    if (typeof patch.chunkSize !== 'number' || !Number.isFinite(patch.chunkSize)) {
      return { ok: false, error: 'chunkSize 必须是数字' };
    }
    if (patch.chunkSize < CHUNK_SIZE_MIN || patch.chunkSize > CHUNK_SIZE_MAX) {
      return {
        ok: false,
        error: `chunkSize 必须在 ${CHUNK_SIZE_MIN}-${CHUNK_SIZE_MAX} 之间`,
      };
    }
  }
  if (patch.chunkOverlap !== undefined) {
    if (typeof patch.chunkOverlap !== 'number' || !Number.isFinite(patch.chunkOverlap)) {
      return { ok: false, error: 'chunkOverlap 必须是数字' };
    }
    if (patch.chunkOverlap < CHUNK_OVERLAP_MIN || patch.chunkOverlap > CHUNK_OVERLAP_MAX) {
      return {
        ok: false,
        error: `chunkOverlap 必须在 ${CHUNK_OVERLAP_MIN}-${CHUNK_OVERLAP_MAX} 之间`,
      };
    }
  }
  if (patch.chunkMode !== undefined && !CHUNK_MODES.has(patch.chunkMode)) {
    return { ok: false, error: 'chunkMode 仅允许 fixed 或 heading' };
  }

  // ---- embeddingProvider 与配套字段 ----
  if (patch.embeddingProvider !== undefined && !EMBEDDING_PROVIDERS.has(patch.embeddingProvider)) {
    return { ok: false, error: 'embeddingProvider 仅允许 local / openai / fallback' };
  }
  if (patch.embeddingProvider === 'openai') {
    if (!nonEmpty(patch.embeddingOpenAIBaseURL)) {
      return { ok: false, error: 'embeddingProvider=openai 时必须填写 embeddingOpenAIBaseURL' };
    }
    if (!nonEmpty(patch.embeddingOpenAIAPIKey)) {
      return { ok: false, error: 'embeddingProvider=openai 时必须填写 embeddingOpenAIAPIKey' };
    }
    if (!nonEmpty(patch.embeddingOpenAIModel)) {
      return { ok: false, error: 'embeddingProvider=openai 时必须填写 embeddingOpenAIModel' };
    }
  }
  if (patch.embeddingProvider === 'local' && !nonEmpty(patch.embeddingModelPath)) {
    return { ok: false, error: 'embeddingProvider=local 时必须填写 embeddingModelPath' };
  }

  // ---- rerankProvider 与配套字段 ----
  if (patch.rerankProvider !== undefined && !RERANK_PROVIDERS.has(patch.rerankProvider)) {
    return { ok: false, error: 'rerankProvider 仅允许 local / openai / none' };
  }
  if (patch.rerankProvider === 'openai') {
    if (!nonEmpty(patch.rerankOpenAIBaseURL)) {
      return { ok: false, error: 'rerankProvider=openai 时必须填写 rerankOpenAIBaseURL' };
    }
    if (!nonEmpty(patch.rerankOpenAIAPIKey)) {
      return { ok: false, error: 'rerankProvider=openai 时必须填写 rerankOpenAIAPIKey' };
    }
    if (!nonEmpty(patch.rerankOpenAIModel)) {
      return { ok: false, error: 'rerankProvider=openai 时必须填写 rerankOpenAIModel' };
    }
  }
  if (patch.rerankProvider === 'local' && !nonEmpty(patch.rerankModelPath)) {
    return { ok: false, error: 'rerankProvider=local 时必须填写 rerankModelPath' };
  }

  return { ok: true };
}
