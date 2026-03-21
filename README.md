# acestep-cpp-api

[ACE-Step 1.5 HTTP API](https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md) emulator backed by **[acestep.cpp](https://github.com/audiohacking/acestep.cpp)** + **[Bun](https://bun.sh)**.

→ **Full API reference**: [`docs/API.md`](docs/API.md)

## Bundled acestep.cpp (v0.0.3)

`bun run build` downloads the correct asset from **[acestep.cpp releases v0.0.3](https://github.com/audiohacking/acestep.cpp/releases/tag/v0.0.3)** for the **current** OS/arch, installs them under `acestep-runtime/bin/`, compiles `dist/acestep-api`, then copies `acestep-runtime` next to the executable:

```text
dist/
  acestep-api          # or acestep-api.exe
  acestep-runtime/
    bin/
      ace-lm
      ace-synth
```

Run the API **from `dist/`** (or anywhere) — the binary resolves siblings via `dirname(execPath)`:

```bash
cd dist && ./acestep-api
```

Override layout with **`ACESTEP_APP_ROOT`** (directory that should contain `acestep-runtime/`) or **`ACESTEP_BIN_DIR`** (direct path to the folder containing `ace-lm` / `ace-synth`).

- Skip download: `SKIP_ACESTEP_BUNDLE=1 bun run build:binary-only`
- Unsupported host (e.g. **darwin x64** has no v0.0.3 zip): set **`ACESTEP_BIN_DIR`** to your own build or use another machine.

## Models directory (always via env)

GGUF paths can be **absolute**, **relative to the app root** (`./models/...`), or **bare filenames** resolved under a models directory:

| Variable | Purpose |
|----------|---------|
| **`ACESTEP_MODELS_DIR`** | Base directory for default LM / embedding / DiT / VAE **filenames** |
| **`ACESTEP_MODEL_PATH`** | Alias (same as above) |
| **`MODELS_DIR`** | Extra alias |

Example (paths from [Hugging Face ACE-Step-1.5-GGUF](https://huggingface.co/Serveurperso/ACE-Step-1.5-GGUF)):

```bash
export ACESTEP_MODELS_DIR="$HOME/models/acestep"
export ACESTEP_LM_MODEL=acestep-5Hz-lm-4B-Q8_0.gguf
export ACESTEP_EMBEDDING_MODEL=Qwen3-Embedding-0.6B-Q8_0.gguf
export ACESTEP_DIT_MODEL=acestep-v15-turbo-Q8_0.gguf
export ACESTEP_VAE_MODEL=vae-BF16.gguf
```

Per-request `lm_model_path` and **`ACESTEP_MODEL_MAP`** values use the same resolution rules.

## Multi-model support (GET /v1/models + per-request `model`)

`GET /v1/models` **automatically scans `ACESTEP_MODELS_DIR`** for `.gguf` files and returns them as the available model list. No extra configuration is required.

```bash
export ACESTEP_MODELS_DIR="$HOME/models/acestep"
# /v1/models will list every .gguf file found there, e.g.:
# ["acestep-v15-turbo-Q8_0.gguf", "acestep-v15-turbo-shift3-Q8_0.gguf"]
```

Use the discovered filename as the `model` value per-request:

```bash
curl http://localhost:8001/v1/models   # discover available names

curl -X POST http://localhost:8001/release_task \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "jazz piano trio", "model": "acestep-v15-turbo-shift3-Q8_0.gguf"}'
```

**Optional: logical names via `ACESTEP_MODEL_MAP`** — map friendly names to GGUF filenames:

```bash
export ACESTEP_MODELS_DIR="$HOME/models/acestep"
export ACESTEP_MODEL_MAP='{"acestep-v15-turbo":"acestep-v15-turbo-Q8_0.gguf","acestep-v15-turbo-shift3":"acestep-v15-turbo-shift3-Q8_0.gguf"}'
# Now use the short names: "model": "acestep-v15-turbo"
```

**Optional: `ACESTEP_MODELS` as a filter/gate** — restrict the list to a subset:

```bash
export ACESTEP_MODELS_DIR="$HOME/models/acestep"
export ACESTEP_MODELS="acestep-v15-turbo-Q8_0.gguf,acestep-v15-turbo-shift3-Q8_0.gguf"
# Only those two filenames appear in /v1/models even if more .gguf files exist
```

Generation parameters (`inference_steps`, `guidance_scale`, `bpm`, etc.) are **always per-request** and are never fixed by environment variables.

## Run (source)

```bash
bun install
bun run bundle:acestep   # once: fetch v0.0.3 binaries for this machine
export ACESTEP_MODELS_DIR=...
export ACESTEP_LM_MODEL=...
export ACESTEP_EMBEDDING_MODEL=...
export ACESTEP_DIT_MODEL=...
export ACESTEP_VAE_MODEL=...
bun run start
```

## Build

```bash
bun run build            # bundle + compile + copy runtime → dist/
bun run build:windows    # on Windows x64
bun run build:binary-only # compile only (reuse existing acestep-runtime/)
```

## ace-synth flags (env)

| Variable | Maps to |
|----------|---------|
| `ACESTEP_MP3_BITRATE` | `--mp3-bitrate` (default **128**) when output is MP3 |
| `ACESTEP_LORA` / `ACESTEP_LORA_SCALE` | `--lora` / `--lora-scale` |
| `ACESTEP_VAE_CHUNK` / `ACESTEP_VAE_OVERLAP` | `--vae-chunk` / `--vae-overlap` |

API `audio_format: "wav"` adds **`--wav`** (no `--mp3-bitrate`).

## Reference / source audio (cover, repaint, lego)

Modes that need a reference or source track (**cover**, **repaint**, **lego**) require one of:

- **Upload** (multipart `POST /release_task`):
  - **`reference_audio`** or **`ref_audio`** — file part (MP3, WAV, etc.)
  - **`src_audio`** or **`ctx_audio`** — file part
  - Uploaded files are written under the task job dir and passed to `ace-synth --src-audio`.
- **Path** (JSON or form fields):
  - **`reference_audio_path`** / **`referenceAudioPath`** — server path (absolute or relative to app root)
  - **`src_audio_path`** / **`srcAudioPath`** — server path

If **`task_type`** is `cover`, `repaint`, or `lego` and neither a path nor an uploaded file is provided, the API returns **400** with a message that reference/source audio is required.

Worker uses **`src_audio_path`** when set, otherwise **`reference_audio_path`**; a single `--src-audio` is passed to ace-synth. Request JSON already supports **`audio_cover_strength`**, **`repainting_start`** / **`repainting_end`**, and **`lego`** (track name) per [acestep.cpp README](https://github.com/audiohacking/acestep.cpp/blob/master/README.md).

## API emulation notes

See [`docs/API.md`](docs/API.md) for the full endpoint reference. **`/format_input`** and **`/create_random_sample`** are shape-compatible stubs (no separate LM HTTP service required).

## GitHub Actions

| Workflow | Trigger | What it does |
|----------|---------|----------------|
| **[CI](.github/workflows/ci.yml)** | Pull requests & pushes to `main` / `master` | `bun test`, bundle acestep v0.0.3 runtime, compile binary on **Ubuntu**, **macOS (arm64)**, **Windows** |
| **[Release](.github/workflows/release.yml)** | **Published releases** & manual `workflow_dispatch` | Same builds, produces `acestep-api-<tag>-linux-x64.tar.gz`, `…-macos-arm64.tar.gz`, `…-windows-x64.zip` (binary + `acestep-runtime/` when present). On **release published**, uploads those archives to the GitHub Release. |

Manual runs (`workflow_dispatch`) build artifacts attached to the workflow run only (not to a draft release).

## License

Your choice for this repo; upstream APIs/models have their own licenses.
