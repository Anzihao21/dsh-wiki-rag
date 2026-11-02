# cordis.patch.yml 配置示例

dsh-wiki-rag 通过 DSH 的 cordis patch 层注入插件行。把下面这段合并进你自己的
`cordis.patch.yml`，或直接覆盖 `bundle/cordis.patch.yml` 后重新构建 bundle。

```yaml
# dsh-wiki-rag bundle patch 层
# 声明本 bundle 贡献的插件行：宿主工具插件（wiki-rag-host）
- insert:
    - id: wiki-rag-host
      name: 'dsh-wiki-rag'
      config:
        # ---- 存储 ----
        # 知识库 Markdown 落盘目录；可改到任意磁盘路径（支持 UNC）
        mdStoragePath: '.dsh-wiki-rag/md'
        # 原始文件 zip 归档目录；MD 编辑不影响这里的原始凭证
        zipStoragePath: '.dsh-wiki-rag/zip'

        # ---- 网页抓取 ----
        # intranet：只走内网代理；extranet：直连公网
        webMode: 'extranet'
        # 单次网页抓取超时（毫秒）
        webTimeout: 15000

        # ---- RAG 切片 ----
        # 每片大约多少字符；越长召回越粗、越短越精
        chunkSize: 500
        # 相邻切片重叠字符数（建议 <= chunkSize/2）
        chunkOverlap: 80

        # ---- 快照 ----
        # 是否在每次导入后自动打快照；默认关闭，按需手动备份
        autoSnapshot: false

        # ---- Embedding ----
        # fallback：字符 n-gram 哈希向量，零依赖离线可用（默认）
        # local：本地 ONNX 模型目录（@xenova/transformers）
        # openai：OpenAI 兼容 embedding API（vLLM / Ollama / OpenAI）
        embeddingProvider: 'fallback'
        # local 模式必填：本地模型目录，如 /models/bge-small-zh-v1.5
        embeddingModelPath: ''
        # openai 模式必填：API 地址 / Key / 模型名
        embeddingOpenAIBaseURL: 'https://api.openai.com/v1'
        embeddingOpenAIAPIKey: ''
        embeddingOpenAIModel: 'text-embedding-3-small'

        # ---- Rerank ----
        # none：不重排（默认）；local：本地 cross-encoder；openai：rerank API
        rerankProvider: 'none'
        rerankModelPath: ''
        rerankOpenAIBaseURL: 'https://api.openai.com/v1'
        rerankOpenAIAPIKey: ''
        rerankOpenAIModel: 'rerank-multilingual-v3'
        # rerank 后最终返回给 Agent 的条数
        rerankTopK: 5
```

## 最小可用配置（开箱即用，零外部依赖）

```yaml
- insert:
    - id: wiki-rag-host
      name: 'dsh-wiki-rag'
      config:
        embeddingProvider: 'fallback'
        rerankProvider: 'none'
```

## 接本地 ONNX 模型示例

```yaml
config:
  embeddingProvider: 'local'
  embeddingModelPath: '/models/bge-small-zh-v1.5'
  rerankProvider: 'local'
  rerankModelPath: '/models/bge-reranker-v2-m3'
  rerankTopK: 5
```

## 接 OpenAI 兼容 API 示例

```yaml
config:
  embeddingProvider: 'openai'
  embeddingOpenAIBaseURL: 'https://your-gateway/v1'
  embeddingOpenAIAPIKey: 'sk-xxxx'
  embeddingOpenAIModel: 'text-embedding-3-small'
  rerankProvider: 'openai'
  rerankOpenAIBaseURL: 'https://your-gateway/v1'
  rerankOpenAIAPIKey: 'sk-xxxx'
  rerankOpenAIModel: 'rerank-multilingual-v3'
```
