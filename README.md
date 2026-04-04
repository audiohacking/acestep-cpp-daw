# acestep-cpp API + Acestep DAW

[ACE-Step 1.5 HTTP API](https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md) emulator backed by **[acestep.cpp](https://github.com/audiohacking/acestep.cpp)** + **[Bun](https://bun.sh)**.

→ **Full API reference**: [`docs/API.md`](docs/API.md)

## ACE-Step-DAW (submodule) for Acestep.cpp

![acestep-daw-demo1-ezgif com-optimize](https://github.com/user-attachments/assets/d6a3426c-50c4-47a9-90c7-be6479c40bae)

This repo includes **[ACE-Step-DAW](https://github.com/ace-step/ACE-Step-DAW)** as a **git submodule** at `ACE-Step-DAW/`.

> **Do not commit fixes inside the submodule.** This project **does not** ship submodule changes — work under `ACE-Step-DAW/` is **lost** on clone/CI. Implement DAW/API compatibility in **`src/`** (and docs/tests here). See **[`AGENTS.md`](AGENTS.md)**.

Clone with the **ACE-Step-DAW** submodule (one level only — do **not** use `--recursive` here; upstream DAW may reference optional nested submodules without public URLs):

```bash
git clone <repo-url>
cd acestep-cpp-api
git submodule update --init ACE-Step-DAW
```

**Demo (DAW UI + API):** set **`ACESTEP_MODELS_DIR`** to a folder containing the usual Hugging Face / acestep.cpp **`.gguf`** files (flat directory). The server **auto-detects** LM, embedding, VAE, DiT **base**, DiT **turbo**, and turbo+**shift** by filename (see [Models directory](#models-directory-always-via-env)). You can still override any path with **`ACESTEP_LM_MODEL`**, etc. Then bundle binaries, build the DAW, start:

```bash
export ACESTEP_MODELS_DIR="$HOME/models/acestep"
bun run bundle:acestep   # once per machine: fetch ace-lm / ace-synth
bun run daw:build
bun run start
# Startup logs list scanned roles + effective paths.
```

### How to open the DAW UI

The API and the built DAW share **one HTTP server**. There is no separate “DAW port.”

1. **`bun run daw:build`** must have run successfully so **`ACE-Step-DAW/dist/index.html`** exists (the log line `ACE-Step-DAW static (if built): …` should point at that folder).
2. Start the server (**`bun run start`** or **`bun run src/index.ts`**).
3. In a browser open the **root URL** of that server — by default:

   **http://127.0.0.1:8001/**

   If you set **`ACESTEP_API_HOST`** / **`ACESTEP_API_PORT`**, use those instead (e.g. `http://127.0.0.1:9000/`).

The server serves the Vite **`dist/`** for ordinary **`GET`** requests (e.g. `/`, `/assets/…`). Deep links to client routes still work because unknown paths fall back to **`index.html`**.

If **`GET /`** returns JSON **`Not Found`**, `dist/` is missing or empty — run **`bun run daw:build`** again or set **`ACESTEP_DAW_DIST`** to a folder that contains a production **`index.html`**.

Static files are served from `ACE-Step-DAW/dist` unless you override **`ACESTEP_DAW_DIST`**.

The DAW’s production client calls **`/api/...`**. This server accepts the **same routes with or without the `/api` prefix** (e.g. `/api/health` and `/health` both work), so you can use the built UI on the **same origin** without Vite’s dev proxy.

Optional: set backend URL in the DAW to **`http://127.0.0.1:<port>`** (no `/api`) in Settings / `localStorage['ace-step-daw-backend-url']` — then requests go to `/release_task`, `/health`, etc. directly.

| Env | Purpose |
|-----|---------|
| **`ACESTEP_DAW_DIST`** | Absolute path to a Vite `dist/` folder (defaults to `<app-root>/ACE-Step-DAW/dist`) |

**Not supported here:** `task_type: stem_separation` (returns **501** — needs the full Python ACE-Step stack). **`/format_input`** / **`/create_random_sample`** remain stubs for API shape compatibility.

**DAW → acestep.cpp mapping:** The bundled DAW sends the same fields as the upstream Python API (FormData + project defaults). This server **normalizes** several mismatches for `lego` (e.g. turbo-style **`guidance_scale` / `shift` / `inference_steps`** are rewritten to the acestep.cpp **lego/base** profile; empty **`prompt`** no longer hides **`caption`**; **sub‑0.5s** repaint windows are collapsed). See **[`docs/API.md`](docs/API.md)** (`lego_client_diffusion`, `ACESTEP_LEGO_CLIENT_DIFFUSION`).

**Building the DAW (no submodule edits):** **`bun run daw:build`** runs **`vite build`** inside **`ACE-Step-DAW/`** only. We intentionally do **not** run the submodule’s **`tsc -b`** step here, so vendored **ACE-Step-DAW** stays a pristine upstream checkout while still producing a usable **`dist/`** for this API server. **Never rely on local edits under `ACE-Step-DAW/`** for product behavior — they are not part of this repository. For the full upstream pipeline (typecheck + Vite), run **`npm run build`** inside the submodule yourself when you need it (that does not change what we ship).

CLI usage matches the upstream [acestep.cpp README](https://github.com/audiohacking/acestep.cpp/blob/master/README.md): **MP3 by default** (128 kbps, overridable), **`--wav`** for stereo 48 kHz WAV, plus optional **`--lora`**, **`--lora-scale`**, **`--vae-chunk`**, **`--vae-overlap`**, **`--mp3-bitrate`**.

## Bundled acestep.cpp (v0.0.3)

`bun run build` downloads the correct asset from **[acestep.cpp releases v0.0.3](https://github.com/audiohacking/acestep.cpp/releases/tag/v0.0.3)** for the **current** OS/arch, **flattens the full archive** into **`acestep-runtime/bin/`** (every file by basename in one directory — no nested `lib/` tree), compiles `dist/acestep-api`, then copies **`acestep-runtime/`** next to the executable.

The prebuilt archives include executables and all shared libraries needed to run them.

```text
dist/
  acestep-api                # or acestep-api.exe
  acestep-runtime/
    bin/                     # flat: entire prebuild payload
      ace-lm                 # 5Hz LM (text + lyrics → audio codes)
      ace-synth              # DiT + VAE (audio codes → audio)
      ace-server             # standalone HTTP server
      ace-understand         # reverse: audio → metadata
      neural-codec           # VAE encode/decode utility
      mp3-codec              # MP3 encoder/decoder utility
      quantize               # GGUF requantizer
      libggml*.so / *.dylib  # GGML shared libraries (Linux / macOS)
      *.dll                  # GGML DLLs (Windows)
      (any other files from the release archive)
```

Run the API **from `dist/`** (or anywhere) — the binary resolves siblings via `dirname(execPath)`:

```bash
cd dist && ./acestep-api
```

Override layout with **`ACESTEP_APP_ROOT`** (directory that should contain `acestep-runtime/`) or **`ACESTEP_BIN_DIR`** (direct path to the folder containing `ace-lm` / `ace-synth`).

- Skip download: `SKIP_ACESTEP_BUNDLE=1 bun run build:binary-only`
- Unsupported host (e.g. **darwin x64** has no v0.0.3 zip): set **`ACESTEP_BIN_DIR`** to your own build or use another machine.

## Models directory (always via env)

Set **`ACESTEP_MODELS_DIR`** (or **`ACESTEP_MODEL_PATH`** / **`MODELS_DIR`**) to a directory containing **`.gguf`** files. The API **scans that directory** (non-recursive) and assigns:

| Detected role | Typical filename hints |
|---------------|-------------------------|
| **LM (5Hz)** | `*5Hz*lm*` / acestep LM gguf |
| **Embedding** | `*Embedding*` (e.g. Qwen3-Embedding) |
| **VAE** | `*vae*` (excluding embedding) |
| **DiT base** | `*v15-base*` — **required for [lego mode](https://github.com/audiohacking/acestep.cpp/blob/master/examples/lego.sh)** (turbo does not support lego) |
| **DiT turbo** | `*v15-turbo*` without `shift` |
| **DiT turbo + shift** | `*v15-turbo*` with `shift` |

**Overrides (optional):** if set, these win over scan — **`ACESTEP_LM_MODEL`**, **`ACESTEP_EMBEDDING_MODEL`**, **`ACESTEP_DIT_MODEL`**, **`ACESTEP_VAE_MODEL`**. Paths can be **absolute**, **relative to app root**, or **basenames** under the models directory.

**Logical DiT names** (for `model` / DAW picker): auto-filled from scan into **`ACESTEP_MODEL_MAP`** unless you pass your own JSON in **`ACESTEP_MODEL_MAP`**: `acestep-v15-base`, `acestep-v15-turbo`, `acestep-v15-turbo-shift3`.

- **Default logical model:** **`acestep-v15-base`** (lego-safe). Override with **`ACESTEP_DEFAULT_MODEL`**.
- **Default `model` when none selected:** resolves to **base** DiT if present, else turbo.
- **`task_type: lego`:** always uses **base** DiT, matching [examples/lego.sh](https://github.com/audiohacking/acestep.cpp/blob/master/examples/lego.sh) (phase 2). Request JSON defaults for lego follow [examples/lego.json](https://github.com/audiohacking/acestep.cpp/blob/master/examples/lego.json): **inference_steps 50**, **guidance_scale 1.0**, **shift 1.0** when the client omits them.

Explicit example (same files as [Hugging Face ACE-Step-1.5-GGUF](https://huggingface.co/Serveurperso/ACE-Step-1.5-GGUF)) — optional if autodetect already finds them:

```bash
export ACESTEP_MODELS_DIR="$HOME/models/acestep"
export ACESTEP_LM_MODEL=acestep-5Hz-lm-4B-Q8_0.gguf
export ACESTEP_EMBEDDING_MODEL=Qwen3-Embedding-0.6B-Q8_0.gguf
export ACESTEP_DIT_MODEL=acestep-v15-base-Q8_0.gguf   # optional; scan prefers base as default DiT
export ACESTEP_VAE_MODEL=vae-BF16.gguf
```

Per-request **`lm_model_path`** and **`ACESTEP_MODEL_MAP`** still use the same path resolution rules.

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
export ACESTEP_MODELS_DIR="$HOME/models/acestep"   # drop-in GGUFs; roles autodetected
bun run start
```

Add **`ACESTEP_*_MODEL`** overrides only if a file is not detected. For lego, ensure a **`*v15-base*.gguf`** is in that folder (or map it — see [Models directory](#models-directory-always-via-env)).

## Storage (temp + audio)

| Env | Default | Purpose |
|-----|---------|---------|
| **`ACESTEP_TMPDIR`** | `./storage/tmp` | Per-task working directory for uploads, `request.json`, and ace-lm / ace-synth output before files move to audio storage. |
| **`ACESTEP_AUDIO_STORAGE`** | `./storage/audio` | Final generated audio served by `GET /v1/audio`. |

**Cleanup:** Each job folder under the temp dir is **deleted after the pipeline finishes** (success or failure). If `/release_task` **rejects the request before the task is queued** (auth, validation, queue full), the session folder is removed as well so empty dirs do not accumulate. On **server startup**, any **empty** immediate subdirectories under `ACESTEP_TMPDIR` are removed (fixes leftovers from older builds).

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

## Generation / subprocess logs

While a task runs, **`ace-lm`** and **`ace-synth`** **stdout/stderr** are forwarded to the **same terminal** as the API server (each line is interleaved with Bun logs). The server also logs one line per task with parsed flags: `thinking`, `use_format`, `sample_mode`, `needLm`, `lmConfigured`.

| Variable | Purpose |
|----------|---------|
| **`ACESTEP_QUIET_SUBPROCESS`** | Set to **`1`** to stop inheriting child output (logs are captured only on failure; use for CI or noisy runs). |

**DAW + multipart note:** form fields like `thinking=false` arrive as the string **`"false"`**. The API parses those explicitly so **`"false"` does not enable** the LM path (unlike `Boolean("false")` in JavaScript).

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

**Repaint bounds:** (1) If both are set and **`repainting_end` ≤ `repainting_start`**, they are cleared to **`-1`** before enqueue. (2) When **`--src-audio`** is a **WAV**, the worker measures its duration and reclamps repaint to **seconds on that file**; values larger than the file length are treated as **beats** using **`bpm`**, then clamped. If the window still collapses (**`end` ≤ `start`**), both are set to **`-1`** so ace-synth does not error on short context clips.

**DAW contract:** ACE-Step-DAW sends **`repainting_start` / `repainting_end` as absolute project timeline seconds** (same time base as the cumulative mix WAV: sample 0 = project t=0). The cumulative mix uploaded as **`src_audio`** must span the full project length so those seconds match the PCM timeline. If you see tiny ranges (e.g. **0.0–0.1 s**) in logs, check the DAW repaint modal selection and that the WAV duration in logs matches the project length.

**Debugging:** On `task_type: repaint`, the server logs **`repaint release_task … incoming` / `after_normalize`** (multipart/JSON as parsed). During the job it logs **`clampRepaintingBounds task_type=… wav_duration_s=… before=(start,end) after=(…)`** (or a warning if **`--src-audio`** is not a readable WAV — clamp is skipped and bounds stay as sent).

**`repainting_*` on `lego` (not only `repaint`):** ACE-Step-DAW sends **`repainting_start` / `repainting_end`** for **lego** too — segment bounds on the **project timeline** (same seconds as the cumulative `src_audio` WAV). Example decoded from a real capture: `task_type=lego`, `repainting_start=0`, `repainting_end=4`, `audio_duration=128` (project length metadata). Do **not** assume a log line that mentions “repaint” in the **engine** always means `task_type: repaint`; check **`task_type`** in API logs first.

**`duration` in request JSON (acestep.cpp):** Upstream **`duration`** is the **target audio length in seconds** for LM/FSM. The DAW sends **`audio_duration`** as **project/timeline length** (e.g. 128s) while **`repainting_*`** marks the active segment (e.g. 0–4s). After clamping bounds to the WAV, the worker sets **`duration` = `repainting_end - `repainting_start`** for **`lego`**, **`repaint`**, and **`cover`** when both bounds are active (**`end` > `start` ≥ 0**). If repainting is inactive (**`-1`**), **`duration`** stays from **`audio_duration`** / **`duration`** as before. Logs: **`durationOverride`**.

**Decode a browser Base64 multipart capture** (e.g. from DevTools → Copy as Base64):

```bash
printf '%s' 'PASTE_BASE64_HERE' | base64 -d | strings | head -80
# or inspect form fields:
printf '%s' 'PASTE_BASE64_HERE' | base64 -d | rg 'name="(task_type|repainting_|audio_duration)"' -A1
```

## API emulation notes

See [`docs/API.md`](docs/API.md) for the full endpoint reference. **`/format_input`** and **`/create_random_sample`** are shape-compatible stubs (no separate LM HTTP service required).

## GitHub Actions

| Workflow | Trigger | What it does |
|----------|---------|----------------|
| **[CI](.github/workflows/ci.yml)** | Pull requests & pushes to `main` / `master` | `bun run test` (`./test` only), bundle acestep v0.0.3 runtime, compile binary on **Ubuntu**, **macOS (arm64)**, **Windows** |
| **[Release](.github/workflows/release.yml)** | **Published releases** & manual `workflow_dispatch` | Same builds, produces `acestep-api-<tag>-linux-x64.tar.gz`, `…-macos-arm64.tar.gz`, `…-windows-x64.zip` (binary + `acestep-runtime/` when present). On **release published**, uploads those archives to the GitHub Release. |

Manual runs (`workflow_dispatch`) build artifacts attached to the workflow run only (not to a draft release).

## License

Your choice for this repo; upstream APIs/models have their own licenses.
