# hidock-pipeline

Pull meeting recordings off a [HiDock P1](https://www.hidock.com/), transcribe
and summarize them with Gemini (Vertex AI), and land the notes in your
Obsidian vault (or any folder).

```
Connect P1 → list pending meetings → choose which to import → Gemini → notes → notification
```

**Only imports what you choose.** Every meeting has different value and
importing costs money, so nothing is processed automatically unless you ask
for it. Selection is a single list — date, length, and estimated cost are
shown up front so you don't have to remember what you recorded.

## Scope

**Meetings only.** The P1's filenames only encode a timestamp and a recording
mode (`Rec` for a normal recording, `Wip` for anything else, e.g. quick voice
memos). Only `Rec` recordings go through the pipeline; anything that can't be
classified is excluded rather than guessed at.

## Install

```bash
npm install -g hidock-pipeline
```

This installs a `hidock` command.

### Prerequisites

- macOS (uses `osascript` for notifications and the recording picker, and the
  `usb` package's native WebUSB binding)
- Node.js >= 22
- [`gcloud` CLI](https://cloud.google.com/sdk/docs/install), authenticated
  (`gcloud auth login`)
- [`ffprobe`](https://ffmpeg.org/) (part of ffmpeg) on your `PATH`
- A HiDock P1 connected via USB-C
- A Google Cloud project with Vertex AI enabled

### One-time GCP setup

```bash
gcloud config set project <PROJECT_ID>
gcloud storage buckets create gs://<PROJECT_ID>-hidock --location=us
```

The bucket needs a short-lived lifecycle rule if you don't want audio to
accumulate — it's only used to hand a `fileUri` to Vertex AI, not for
long-term storage.

## Usage

```bash
export GCP_PROJECT=<PROJECT_ID>

hidock --list          # what's pending, and what it would cost
hidock --list --json   # same, as JSON (used by the Raycast extension)
hidock                 # show a picker, import what you choose
hidock --all           # import everything pending, no picker
hidock Rec14           # import a specific recording by name fragment
```

`--list` never touches Gemini or GCS, so it works even before `GCP_PROJECT`
is set.

### Try it without a device

```bash
HIDOCK_DEVICE=replay hidock --list --json
```

Runs against a bundled fixture listing instead of a real P1 — useful for
trying the CLI out, or for demoing the Raycast extension. There's no fixture
audio, so `--pick`/`--all` will fail per-recording with a clear
"no replay audio available" message rather than actually generating notes.

## Configuration

| Env var | Default | Notes |
|---|---|---|
| `GCP_PROJECT` | *(required)* | Your Google Cloud project id. Required for everything except `--list`. |
| `GEMINI_MODEL` | `gemini-3.6-flash` | |
| `HIDOCK_BUCKET` | `gs://${GCP_PROJECT}-hidock` | |
| `HIDOCK_INBOX` | `~/HiDockInbox` | Scratch space for downloaded audio, outside any synced folder. |
| `HIDOCK_NOTE_DIR` | `~/Documents/hidock-notes` | Where notes are written — point this at your Obsidian vault. |
| `HIDOCK_DEVICE` | *(unset)* | Set to `replay` to use the bundled fixture instead of a real device. |

## Development

```bash
npm install
npm run verify     # typecheck → Biome → circular-dep check → tests + coverage
npm run check:fix  # auto-fix lint/format issues
npm run test:watch
npm run build       # compile src/ to dist/ (what gets published)
```

`npm run verify` is the only gate — don't commit if it doesn't pass. Lint and
formatting are handled entirely by Biome (no ESLint/Prettier), with `preset:
"all"` and tuned limits (cognitive complexity ≤ 10, ≤ 50 lines/function, ≤ 300
lines/file, ≤ 4 params, no circular deps, ≥ 85% test coverage).

## Layout

```
.
├── biome.jsonc         # lint + format config
├── src/
│   ├── classify.ts     # recording-kind detection (Rec = meeting / Wip = excluded)
│   ├── cli.ts           # entrypoint
│   ├── device/          # USB transport + the P1's binary protocol
│   ├── gemini/           # Vertex AI calls
│   ├── gcs/              # audio upload
│   ├── pipeline/         # end-to-end orchestration
│   ├── state/             # processed-recording idempotency store
│   └── vault/             # note assembly
├── tests/
└── fixtures/            # sample device listing used by replay mode + tests
```

## Stack

| Layer | Choice |
|---|---|
| Language | TypeScript / Node.js >= 22 |
| USB | `usb` v3 (WebUSB-compatible API) |
| Audio hand-off | Uploaded to GCS, referenced via `fileData.fileUri` (inline base64 hits Vertex AI's limit past ~30 minutes) |
| Transcription/summary | Vertex AI REST API via `fetch` — no SDK |

Auth is via Vertex AI (`gcloud auth print-access-token`); no API key needed.

## Security

Audio and transcripts are never committed — `.gitignore` excludes them from
the start. Working files live in `~/HiDockInbox/`, outside this repository.

## License

MIT — see [LICENSE](LICENSE).
