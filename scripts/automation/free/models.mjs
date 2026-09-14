// Pure data shared by inference, canonical validation and email acceptance.
// Never broaden to arbitrary @cf models or paid-only models.
export const DEFAULT_CLOUDFLARE_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const EXPERIMENTAL_FREE_WRITER_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
// Cloudflare-hosted open weights, covered by Workers Free allocation. This is
// not an OpenAI Responses endpoint, paid-plan opt-in or automatic model fallback.
export const FREE_REASONING_WRITER_MODEL = "@cf/openai/gpt-oss-120b";
export const FREE_CLOUDFLARE_AI_MODELS = Object.freeze([DEFAULT_CLOUDFLARE_AI_MODEL,
  EXPERIMENTAL_FREE_WRITER_MODEL, FREE_REASONING_WRITER_MODEL]);
