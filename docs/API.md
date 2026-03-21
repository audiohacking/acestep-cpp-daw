# ACE-Step API Documentation

This service emulates the [ACE-Step 1.5 HTTP API](https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md) backed by **[acestep.cpp](https://github.com/audiohacking/acestep.cpp)** (`ace-lm` + `ace-synth`).

**Basic workflow:**

1. Submit a task with `POST /release_task` → receive a `task_id`.
2. Poll `POST /query_result` until `status` is `1` (succeeded) or `2` (failed).
3. Download the audio with `GET /v1/audio?path=...` using the URL returned in the result.

---

## Table of Contents

- [Authentication](#1-authentication)
- [Response Format](#2-response-format)
- [Task Status Codes](#3-task-status-codes)
- [Create Generation Task](#4-create-generation-task)
- [Batch Query Task Results](#5-batch-query-task-results)
- [Format Input](#6-format-input)
- [Get Random Sample](#7-get-random-sample)
- [List Available Models](#8-list-available-models)
- [Server Statistics](#9-server-statistics)
- [Download Audio Files](#10-download-audio-files)
- [Health Check](#11-health-check)
- [Environment Variables](#12-environment-variables)

---

## 1. Authentication

API key authentication is optional. When `ACESTEP_API_KEY` is set, every request must supply the key via one of:

**Body field (`ai_token`)**:
```json
{ "ai_token": "your-api-key", "prompt": "upbeat pop song" }
```

**Authorization header**:
```
Authorization: Bearer your-api-key
```

---

## 2. Response Format

All endpoints return a unified wrapper:

```json
{
  "data": { },
  "code": 200,
  "error": null,
  "timestamp": 1700000000000,
  "extra": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data` | any | Actual response payload |
| `code` | int | Status code (`200` = success) |
| `error` | string\|null | Error message (null on success) |
| `timestamp` | int | Response timestamp (ms) |
| `extra` | any | Extra information (usually null) |

**Error responses** use `{ "detail": "..." }` with the appropriate HTTP status code.

---

## 3. Task Status Codes

| Code | Meaning |
|------|---------|
| `0` | Queued or running |
| `1` | Succeeded — result is ready |
| `2` | Failed |

---

## 4. Create Generation Task

### 4.1 Endpoint

- **URL**: `POST /release_task`
- **Content-Type**: `application/json`, `multipart/form-data`, or `application/x-www-form-urlencoded`

### 4.2 Request Parameters

Both **snake_case** and **camelCase** aliases are accepted. Metadata can also be passed in a nested `metas` / `metadata` / `user_metadata` object.

#### Basic Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | `""` | Music description (alias: `caption`) |
| `lyrics` | string | `""` | Lyrics content |
| `thinking` | bool | `false` | Run 5Hz LM to generate audio codes (lm-dit mode) |
| `vocal_language` | string | `"en"` | Lyrics language (`en`, `zh`, `ja`, …) |
| `audio_format` | string | `"mp3"` | Output format: `mp3` or `wav` |

#### Sample / Description Mode

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sample_mode` | bool | `false` | Generate from a short natural-language description |
| `sample_query` | string | `""` | Description text (aliases: `description`, `desc`) |
| `use_format` | bool | `false` | Let LM enhance caption and lyrics (aliases: `format`) |

#### Model Selection

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | string | *(default model)* | DiT model name — use `GET /v1/models` to list available names |

> When `model` is omitted the server uses the default model. Use `GET /v1/models` to discover available names and `ACESTEP_MODEL_MAP` to register them (see [Environment Variables](#12-environment-variables)).

#### Music Attributes

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `bpm` | int | null | Tempo in BPM (30–300) |
| `key_scale` | string | `""` | Key/scale (e.g. `"C Major"`, `"Am"`) — aliases: `keyscale`, `keyScale` |
| `time_signature` | string | `""` | `"2"`, `"3"`, `"4"`, or `"6"` — aliases: `timesignature`, `timeSignature` |
| `audio_duration` | float | null | Duration in seconds (10–600) — aliases: `duration`, `target_duration` |

#### Audio Codes

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `audio_code_string` | string or string[] | `""` | Pre-computed 5Hz audio tokens for lm-dit (alias: `audioCodeString`) |

#### Generation Control

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `inference_steps` | int | `8` | Diffusion steps (turbo: 1–20; base: 1–200) |
| `guidance_scale` | float | `7.0` | Guidance coefficient (base model only) |
| `use_random_seed` | bool | `true` | Use a random seed |
| `seed` | int | `-1` | Fixed seed (when `use_random_seed=false`) |
| `batch_size` | int | `2` | Number of clips to generate (1–8) |

#### Advanced DiT Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `shift` | float | `3.0` | Timestep shift (1.0–5.0; base models only) |
| `infer_method` | string | `"ode"` | `"ode"` (Euler) or `"sde"` (stochastic) |
| `timesteps` | string | null | Custom comma-separated timesteps (overrides `inference_steps` + `shift`) |
| `use_adg` | bool | `false` | Adaptive Dual Guidance (base model only) |
| `cfg_interval_start` | float | `0.0` | CFG start ratio (0.0–1.0) |
| `cfg_interval_end` | float | `1.0` | CFG end ratio (0.0–1.0) |

#### 5Hz LM Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `lm_model_path` | string | null | LM checkpoint name / path override (alias: `lmModelPath`) |
| `lm_temperature` | float | `0.85` | Sampling temperature |
| `lm_cfg_scale` | float | `2.5` | CFG scale (>1 enables CFG) |
| `lm_negative_prompt` | string | `"NO USER INPUT"` | Negative prompt for CFG |
| `lm_top_k` | int | null | Top-k (0/null disables) |
| `lm_top_p` | float | `0.9` | Top-p |
| `lm_repetition_penalty` | float | `1.0` | Repetition penalty |

#### LM Chain-of-Thought Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `use_cot_caption` | bool | `true` | Let LM rewrite caption via CoT (aliases: `cot_caption`) |
| `use_cot_language` | bool | `true` | Let LM detect vocal language via CoT (aliases: `cot_language`) |
| `constrained_decoding` | bool | `true` | FSM-constrained decoding for structured output (aliases: `constrained`) |

#### Edit / Reference Audio (JSON path or uploaded file)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `task_type` | string | `"text2music"` | `text2music`, `cover`, `repaint`, `lego`, `extract`, `complete` |
| `reference_audio_path` | string | null | Server path to reference audio (Style Transfer) |
| `src_audio_path` | string | null | Server path to source audio (Cover / Repainting) |
| `instruction` | string | auto | Edit instruction |
| `repainting_start` | float | `0.0` | Repainting start time (seconds) |
| `repainting_end` | float | null | Repainting end time (-1 = end of audio) |
| `audio_cover_strength` | float | `1.0` | Cover strength (0.0–1.0) |

#### File Upload (multipart/form-data)

Supply audio files as form parts instead of server paths:

| Field | Description |
|-------|-------------|
| `reference_audio` / `ref_audio` | Reference audio file (style transfer) |
| `src_audio` / `ctx_audio` | Source audio file (cover / repaint) |

> `task_type` values `cover`, `repaint`, and `lego` require either a file upload or the corresponding `_path` field — the API returns **400** otherwise.

### 4.3 Response

```json
{
  "data": {
    "task_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "queued",
    "queue_position": 1
  },
  "code": 200,
  "error": null,
  "timestamp": 1700000000000,
  "extra": null
}
```

### 4.4 Examples

**Basic JSON request:**
```bash
curl -X POST http://localhost:8001/release_task \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "upbeat pop song", "lyrics": "Hello world", "inference_steps": 8}'
```

**With `thinking=true` (LM generates codes + fills missing metadata):**
```bash
curl -X POST http://localhost:8001/release_task \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "upbeat pop song", "lyrics": "Hello world", "thinking": true}'
```

**Description-driven generation:**
```bash
curl -X POST http://localhost:8001/release_task \
  -H 'Content-Type: application/json' \
  -d '{"sample_query": "a soft Bengali love song for a quiet evening", "thinking": true}'
```

**Select a specific model:**
```bash
curl -X POST http://localhost:8001/release_task \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "electronic dance music", "model": "acestep-v15-turbo-shift3", "thinking": true}'
```

**Custom timesteps:**
```bash
curl -X POST http://localhost:8001/release_task \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "jazz piano trio", "timesteps": "0.97,0.76,0.615,0.5,0.395,0.28,0.18,0.085,0"}'
```

**File upload (cover task):**
```bash
curl -X POST http://localhost:8001/release_task \
  -F "prompt=remix this song" \
  -F "src_audio=@/path/to/local/song.mp3" \
  -F "task_type=repaint"
```

---

## 5. Batch Query Task Results

### 5.1 Endpoint

- **URL**: `POST /query_result`
- **Content-Type**: `application/json` or `application/x-www-form-urlencoded`

### 5.2 Request Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `task_id_list` | string (JSON array) or array | Task IDs to query |

### 5.3 Response

```json
{
  "data": [
    {
      "task_id": "550e8400-e29b-41d4-a716-446655440000",
      "status": 1,
      "result": "[{\"file\": \"/v1/audio?path=...\", \"wave\": \"\", \"status\": 1, \"create_time\": 1700000000, \"env\": \"development\", \"prompt\": \"upbeat pop song\", \"lyrics\": \"Hello world\", \"metas\": {\"bpm\": 120, \"duration\": 30, \"genres\": \"\", \"keyscale\": \"C Major\", \"timesignature\": \"4\"}, \"generation_info\": \"acestep.cpp\", \"seed_value\": \"12345\", \"lm_model\": \"acestep-5Hz-lm-0.6B\", \"dit_model\": \"acestep-v15-turbo\"}]"
    }
  ],
  "code": 200,
  "error": null,
  "timestamp": 1700000000000,
  "extra": null
}
```

**`result` field** (JSON string — parse to obtain):

| Field | Type | Description |
|-------|------|-------------|
| `file` | string | Audio URL for `GET /v1/audio` |
| `wave` | string | Waveform data (empty) |
| `status` | int | `0` in-progress, `1` success, `2` failed |
| `create_time` | int | Unix timestamp |
| `env` | string | Environment identifier |
| `prompt` | string | Caption used |
| `lyrics` | string | Lyrics used |
| `metas` | object | `{bpm, duration, genres, keyscale, timesignature}` |
| `generation_info` | string | Generation summary |
| `seed_value` | string | Seed(s) used |
| `lm_model` | string | LM model name |
| `dit_model` | string | DiT model name |

### 5.4 Example

```bash
curl -X POST http://localhost:8001/query_result \
  -H 'Content-Type: application/json' \
  -d '{"task_id_list": ["550e8400-e29b-41d4-a716-446655440000"]}'
```

---

## 6. Format Input

### 6.1 Endpoint

- **URL**: `POST /format_input`
- **Content-Type**: `application/json` or `application/x-www-form-urlencoded`

Uses LLM to enhance and format user-provided caption and lyrics. *(This is a shape-compatible stub; actual LM enhancement is performed per-task when `use_format=true` in `/release_task`.)*

### 6.2 Request Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | `""` | Music description (alias: `caption`) |
| `lyrics` | string | `""` | Lyrics content |
| `temperature` | float | `0.85` | LM sampling temperature |
| `param_obj` | string (JSON) | `"{}"` | Metadata hints: `duration`, `bpm`, `key`, `time_signature`, `language` |

### 6.3 Response

```json
{
  "data": {
    "caption": "Enhanced music description",
    "lyrics": "Formatted lyrics...",
    "bpm": 120,
    "key_scale": "C Major",
    "time_signature": "4",
    "duration": 180,
    "vocal_language": "en"
  },
  "code": 200,
  "error": null,
  "timestamp": 1700000000000,
  "extra": null
}
```

### 6.4 Example

```bash
curl -X POST http://localhost:8001/format_input \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "pop rock", "lyrics": "Walking down the street", "param_obj": "{\"duration\": 180}"}'
```

---

## 7. Get Random Sample

### 7.1 Endpoint

- **URL**: `POST /create_random_sample`
- **Content-Type**: `application/json` or `application/x-www-form-urlencoded`

Returns a preset sample for form auto-fill.

### 7.2 Request Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sample_type` | string | `"simple_mode"` | `"simple_mode"` or `"custom_mode"` |

### 7.3 Response

```json
{
  "data": {
    "caption": "Upbeat pop song with guitar accompaniment",
    "lyrics": "[Verse 1]\nSunshine on my face...",
    "bpm": 120,
    "key_scale": "G Major",
    "time_signature": "4",
    "duration": 180,
    "vocal_language": "en"
  },
  "code": 200,
  "error": null,
  "timestamp": 1700000000000,
  "extra": null
}
```

### 7.4 Example

```bash
curl -X POST http://localhost:8001/create_random_sample \
  -H 'Content-Type: application/json' \
  -d '{"sample_type": "simple_mode"}'
```

---

## 8. List Available Models

### 8.1 Endpoint

- **URL**: `GET /v1/models`

Returns the DiT models available on this server. The list is discovered automatically by scanning `ACESTEP_MODELS_DIR` for `.gguf` files. `ACESTEP_MODEL_MAP` (if set) overrides discovery with explicit logical names. `ACESTEP_MODELS` acts as a filter/gate on the discovered list.

### 8.2 Response

```json
{
  "data": {
    "models": [
      { "name": "acestep-v15-turbo-Q8_0.gguf", "is_default": true  },
      { "name": "acestep-v15-turbo-shift3-Q8_0.gguf", "is_default": false }
    ],
    "default_model": "acestep-v15-turbo-Q8_0.gguf"
  },
  "code": 200,
  "error": null,
  "timestamp": 1700000000000,
  "extra": null
}
```

### 8.3 Example

```bash
curl http://localhost:8001/v1/models
```

### 8.4 Model discovery order

1. **`ACESTEP_MODEL_MAP`** (explicit) — JSON map of `{"logical-name": "file.gguf", …}`. The logical names are exposed as the model names. Use this when you want human-friendly names instead of raw filenames.
2. **`ACESTEP_MODELS_DIR` scan** (automatic) — `.gguf` files found in the models directory are listed by their filename (e.g. `acestep-v15-turbo-Q8_0.gguf`). Sorted alphabetically.
3. **Fallback** — `[defaultModel]` when no directory is set and no map is configured.

`ACESTEP_MODELS` (comma-separated names) acts as a **filter/gate** on whichever source is discovered (map keys or scanned filenames). Only names present in the filter are returned.

### 8.5 Selecting a model per-request

Use the `model` field in `/release_task` with a name from the list:

```bash
# Auto-discover — just set the models dir
export ACESTEP_MODELS_DIR="$HOME/models/acestep"

# List what was found
curl http://localhost:8001/v1/models
# → ["acestep-v15-turbo-Q8_0.gguf", "acestep-v15-turbo-shift3-Q8_0.gguf", ...]

# Select one per-request
curl -X POST http://localhost:8001/release_task \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "jazz piano trio", "model": "acestep-v15-turbo-shift3-Q8_0.gguf"}'
```

Or use `ACESTEP_MODEL_MAP` for logical names:

```bash
export ACESTEP_MODELS_DIR="$HOME/models/acestep"
export ACESTEP_MODEL_MAP='{"acestep-v15-turbo":"acestep-v15-turbo-Q8_0.gguf","acestep-v15-turbo-shift3":"acestep-v15-turbo-shift3-Q8_0.gguf"}'

curl -X POST http://localhost:8001/release_task \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "jazz piano trio", "model": "acestep-v15-turbo-shift3"}'
```

Or gate the list to a subset:

```bash
export ACESTEP_MODELS_DIR="$HOME/models/acestep"
export ACESTEP_MODELS="acestep-v15-turbo-Q8_0.gguf,acestep-v15-turbo-shift3-Q8_0.gguf"
```

---

## 9. Server Statistics

### 9.1 Endpoint

- **URL**: `GET /v1/stats`

### 9.2 Response

```json
{
  "data": {
    "jobs": {
      "total": 100,
      "queued": 5,
      "running": 1,
      "succeeded": 90,
      "failed": 4
    },
    "queue_size": 5,
    "queue_maxsize": 200,
    "avg_job_seconds": 8.5
  },
  "code": 200,
  "error": null,
  "timestamp": 1700000000000,
  "extra": null
}
```

### 9.3 Example

```bash
curl http://localhost:8001/v1/stats
```

---

## 10. Download Audio Files

### 10.1 Endpoint

- **URL**: `GET /v1/audio`

### 10.2 Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | string | URL-encoded path returned in task `result.file` |

### 10.3 Example

```bash
curl "http://localhost:8001/v1/audio?path=%2Fabc123.mp3" -o output.mp3
```

---

## 11. Health Check

### 11.1 Endpoint

- **URL**: `GET /health`

### 11.2 Response

```json
{
  "data": { "status": "ok", "service": "ACE-Step API", "version": "1.0" },
  "code": 200,
  "error": null,
  "timestamp": 1700000000000,
  "extra": null
}
```

---

## 12. Environment Variables

Only **paths** and server-level settings are configured via environment variables. Generation parameters (steps, guidance scale, BPM, …) are always supplied per-request.

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `ACESTEP_API_HOST` | `127.0.0.1` | Bind host |
| `ACESTEP_API_PORT` | `8001` | Bind port |
| `ACESTEP_API_KEY` | *(empty)* | API key (empty = auth disabled) |
| `ACESTEP_API_WORKERS` / `ACESTEP_QUEUE_WORKERS` | `1` | Queue worker count |

### Paths

| Variable | Description |
|----------|-------------|
| `ACESTEP_BIN_DIR` | Directory containing `ace-lm` / `ace-synth` (overrides bundled runtime) |
| `ACESTEP_APP_ROOT` | Root directory for resolving `acestep-runtime/` |
| `ACESTEP_MODELS_DIR` / `ACESTEP_MODEL_PATH` / `MODELS_DIR` | Base directory for bare GGUF filenames |
| `ACESTEP_LM_MODEL` / `ACESTEP_LM_MODEL_PATH` | Default 5Hz LM GGUF path or filename |
| `ACESTEP_EMBEDDING_MODEL` | Embedding model GGUF |
| `ACESTEP_DIT_MODEL` / `ACESTEP_CONFIG_PATH` | Default DiT model GGUF |
| `ACESTEP_VAE_MODEL` | VAE model GGUF |
| `ACESTEP_LORA` / `ACESTEP_LORA_SCALE` | LoRA path / scale for ace-synth |

### Multi-Model Support

| Variable | Default | Description |
|----------|---------|-------------|
| `ACESTEP_MODEL_MAP` | `{}` | JSON map of `{"name": "file.gguf", …}` — explicit name→path mapping. Drives both `/v1/models` and per-request `model` validation. Takes precedence over directory scan. |
| `ACESTEP_DEFAULT_MODEL` | first map key / first scanned file / `"acestep-v15-turbo"` | Name used when no `model` is specified per-request |
| `ACESTEP_MODELS` | *(all discovered)* | Comma-separated **filter/gate** applied to the discovered list (map keys or scanned filenames). Only names in this list are returned by `/v1/models`. |

> **Recommended minimal setup** (no `ACESTEP_MODEL_MAP` needed):
> ```bash
> export ACESTEP_MODELS_DIR="$HOME/models/acestep"
> # /v1/models will automatically list every .gguf file in that directory
> ```

### Queue / Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `ACESTEP_QUEUE_MAXSIZE` | `200` | Maximum queued tasks |
| `ACESTEP_AUDIO_STORAGE` | `./storage/audio` | Audio output directory |
| `ACESTEP_TMPDIR` | `./storage/tmp` | Temporary job directory |
| `ACESTEP_AVG_JOB_SECONDS` | `5.0` | Initial average job time estimate |
| `ACESTEP_AVG_WINDOW` | `50` | Rolling window for job time averaging |
| `ACESTEP_MP3_BITRATE` | `128` | MP3 output bitrate |

### VAE Tiling

| Variable | Description |
|----------|-------------|
| `ACESTEP_VAE_CHUNK` | `--vae-chunk` for ace-synth |
| `ACESTEP_VAE_OVERLAP` | `--vae-overlap` for ace-synth |

---

## Error Handling

| HTTP Status | Meaning |
|-------------|---------|
| `200` | Success |
| `400` | Invalid request (bad JSON, missing required fields) |
| `401` | Unauthorized |
| `404` | Resource not found |
| `415` | Unsupported Content-Type |
| `429` | Queue full |
| `500` | Internal server error |

Error responses use:
```json
{ "detail": "Error message describing the issue" }
```

---

## Differences from ACE-Step 1.5 Python Server

| Feature | ACE-Step 1.5 | acestep-cpp-api |
|---------|-------------|-----------------|
| Backend | Python / PyTorch | acestep.cpp (`ace-lm` + `ace-synth`) |
| `audio_format: "flac"` | Supported | Not supported (returns 415) |
| `/format_input` | Full LM call | Stub (shape-compatible) |
| `/create_random_sample` | Loaded from examples | Fixed presets |
| LM backend | vllm / pt | GGUF via llama.cpp |
| Multi-model | `ACESTEP_CONFIG_PATH{2,3}` | `ACESTEP_MODEL_MAP` JSON |
