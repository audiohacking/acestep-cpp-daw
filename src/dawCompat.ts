import { basename } from "path";
import { config } from "./config";

/** ACE-Step-DAW `ModelsListResponse` (listModels → /v1/model_inventory or /v1/models). */
export function modelInventoryData() {
  const lmPath = config.lmModelPath;
  const lmConfigured = Boolean(lmPath?.trim());
  const lmName = lmConfigured ? basename(lmPath) || "lm" : "";

  return {
    models: config.modelsList.map((name) => ({
      name,
      is_default: name === config.defaultModel,
      is_loaded: true,
      supported_task_types: ["lego", "cover", "repaint"],
    })),
    default_model: config.defaultModel,
    lm_models: lmConfigured ? [{ name: lmName, is_loaded: true }] : [],
    loaded_lm_model: lmConfigured ? lmName : null,
    llm_initialized: lmConfigured,
  };
}

/** Stub for DAW Settings “Init model” — acestep-cpp loads GGUF from env, not at runtime. */
export function initModelResponse(body: Record<string, unknown>) {
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : config.defaultModel;
  const initLlm = body.init_llm === true || body.initLlm === true;
  const lmPath =
    typeof body.lm_model_path === "string" && body.lm_model_path.trim()
      ? body.lm_model_path.trim()
      : typeof body.lmModelPath === "string" && body.lmModelPath.trim()
        ? body.lmModelPath.trim()
        : config.lmModelPath;

  const lmConfigured = Boolean(lmPath?.trim());
  const lmName = lmConfigured ? basename(lmPath) : null;

  const models = config.modelsList.map((name) => ({
    name,
    is_default: name === config.defaultModel,
    is_loaded: true,
    supported_task_types: ["lego", "cover", "repaint"],
  }));

  return {
    message:
      "acestep-cpp-api: DiT/LM paths come from ACESTEP_* env vars and/or scanning ACESTEP_MODELS_DIR; this endpoint is a no-op for UI compatibility.",
    loaded_model: model,
    loaded_lm_model: initLlm || lmConfigured ? lmName : null,
    models,
    lm_models: lmConfigured ? [{ name: lmName!, is_loaded: true }] : [],
    llm_initialized: lmConfigured,
  };
}
