# VidSub

VidSub turns speech in a video into timed English subtitles. It has a web app and
an API. The API stores the uploaded video in your Google Drive, uses AssemblyAI
to transcribe speech, and uses Gemini to translate the transcript.

This guide is written for first-time users as well as developers. Follow the
Docker instructions if you want the fewest setup steps, or the Node.js
instructions if you want to work on the code.

## What you need

Choose one way to run VidSub:

- **Docker (recommended for trying VidSub):** install
  [Docker Desktop](https://www.docker.com/products/docker-desktop/) and make
  sure it is running.
- **Run from source:** install [Node.js 24 or newer](https://nodejs.org/) and
  enable Corepack (included with Node.js 24):

  ```sh
  corepack enable
  ```

  Corepack uses the pnpm version specified by this project.

To use the complete video-to-subtitles workflow, you will also need API
credentials for Google Drive, AssemblyAI, and Gemini. The services may charge
for use(if locally setup it is free to use for some videos, too many videos may lead to hitting rate limits and all). You can start the app and check its health without credentials, but
you cannot upload and process a video until they are configured.

## 1. Get a copy of the project

If you are comfortable with Git, clone this repository and open the project
folder in a terminal:

```sh
git clone https://github.com/querysmith-sys/vidsub.git
cd vidsub
```

If you already have the project files, open a terminal in the `vidsub` folder
instead. All commands below should be run from that folder unless a step says
otherwise.

## 2. Configure your private credentials

The API needs credentials to save videos to Google Drive, transcribe them, and
translate the resulting subtitles. Create `apps/api/.env` in a text editor
(make sure the filename is exactly `.env`, not `.env.txt`) and add these lines:

```dotenv
FOLDER_ID=
YOUR_CLIENT_ID=
YOUR_CLIENT_SECRET=
STATIC_REDIRECT_URI=https://developers.google.com/oauthplayground
YOUR_REFRESH_TOKEN=
ASSEMBLYAI_API_KEY=
GEMINI_API_KEY=
VIDEO_TEMP_DIR=
```

FILL IT! :>

### Get the Google Drive settings

1. In the [Google Cloud Console](https://console.cloud.google.com/), create or
   select a project and enable the **Google Drive API**.
2. Configure the OAuth consent screen for your account. If the app is in
   testing mode, add your Google account as a test user.
3. Create an OAuth client ID. For a web application client, add
   `https://developers.google.com/oauthplayground` as an authorized redirect
   URI. Copy its client ID and client secret into `YOUR_CLIENT_ID` and
   `YOUR_CLIENT_SECRET`.
4. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground),
   open its settings (the gear icon), and choose **Use your own OAuth
   credentials**. Enter the client ID and secret you just created.
5. In the Playground, authorize the Google Drive scope
   `https://www.googleapis.com/auth/drive`, then exchange the authorization
   code for Refresh tokens. Copy the refresh token into `YOUR_REFRESH_TOKEN`.
6. Create a folder in Google Drive for VidSub uploads. Copy the folder ID from
   the end of its URL and put it in `FOLDER_ID`.
7. Set `STATIC_REDIRECT_URI` to
   `https://developers.google.com/oauthplayground` (it must match the
   redirect URI configured for the OAuth client).

Google's setup screens can change. If you get stuck, see the
[Google Drive API quickstart](https://developers.google.com/workspace/drive/api/quickstart)
and the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground).

### Get the transcription and translation keys

- Create an [AssemblyAI](https://www.assemblyai.com/) account and copy its API
  key into `ASSEMBLYAI_API_KEY`.
- Create a [Google AI Studio](https://aistudio.google.com/) API key and copy it
  into `GEMINI_API_KEY`.

Never put private credentials... out in public!!

## 3. Start VidSub

### Option A: Docker (recommended)

With Docker Desktop running, open a terminal in the project folder and run:

```sh
docker compose up --build
```

The first start may take several minutes while Docker downloads and builds the
app. When the services are ready, open [http://localhost:5173](http://localhost:5173).
The API health check is at [http://localhost:3000/health](http://localhost:3000/health).

Keep this terminal open while using VidSub. To stop the app, press `Ctrl+C` or `docker compose down` if used `docker compose up --build -d`, -d flag allows it to run it in background freeing your terminal.
You can start it again later with `docker compose up`.

### Option B: Run from source

Install the project packages once:

```sh
pnpm install
```

Then start the web app and API together:

```sh
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). The API health check is
at [http://localhost:3000/health](http://localhost:3000/health). Keep the
terminal open while using VidSub; press `Ctrl+C` to stop it.

## 4. Use VidSub

1. Open the VidSub page at `http://localhost:5173`.
2. Choose an MP4 or MKV video that is 30 minutes or shorter.
3. Start the upload and wait while VidSub transcribes the speech and adds
   English subtitles.
4. Download the finished video when processing is complete.

The original video is not changed. Processing uses Google Drive, AssemblyAI,
and Gemini, so only upload videos you are allowed to share with those services
and review their privacy and billing terms first.

## Environment settings

| Setting | File | What it is for |
| --- | --- | --- |
| `FOLDER_ID` | `apps/api/.env` | Google Drive folder where uploaded videos are stored. |
| `YOUR_CLIENT_ID` | `apps/api/.env` | Google OAuth client ID. |
| `YOUR_CLIENT_SECRET` | `apps/api/.env` | Google OAuth client secret. Keep private. |
| `STATIC_REDIRECT_URI` | `apps/api/.env` | OAuth redirect URI used for the Google token setup. |
| `YOUR_REFRESH_TOKEN` | `apps/api/.env` | Google OAuth refresh token. Keep private. |
| `ASSEMBLYAI_API_KEY` | `apps/api/.env` | AssemblyAI transcription API key. Keep private. |
| `GEMINI_API_KEY` | `apps/api/.env` | Gemini translation API key. Keep private. |
| `VIDEO_TEMP_DIR` | `apps/api/.env` | Optional folder for temporary video-processing files. Defaults to the operating system's temporary folder. |
| `VITE_API_ORIGIN` | `apps/web/.env.local` or project-root `.env` | API address used by the website. Defaults to `http://localhost:3000`. |

For local development, the API already allows `http://localhost:5173`, so the
default setup needs no extra website-origin configuration. To change the API
address for source development, copy `apps/web/.env.example` to
`apps/web/.env.local` and edit `VITE_API_ORIGIN`. For Docker, create a
project-root file named `.env` and put `VITE_API_ORIGIN=http://localhost:3000`
in it. The normal all-on-one-computer setup uses this default.

The API allows the local development website and the existing hosted website
origin by default. If you host the website at a different address, a developer
must add that origin to the API's CORS allowlist before the browser can connect.

## Stop, restart, and troubleshoot

- For Docker, stop with `Ctrl+C`. If you started it in the background with
  `docker compose up -d`, use `docker compose down` to stop it.
- For source development, stop with `Ctrl+C` in the terminal running `pnpm dev`.
- If the page cannot reach the API, check that both services are running and
  that `VITE_API_ORIGIN` points to the API address. If using a custom website
  address, its origin must be added to the API's CORS allowlist; this currently
  requires a developer to update the API configuration.
- If the API starts but uploads fail, check the Google Drive values, folder
  ID, and OAuth refresh token in `apps/api/.env`.
- If transcription or translation fails, check `ASSEMBLYAI_API_KEY` and
  `GEMINI_API_KEY` and make sure those services are available to your account.
- The API health check should return `{"status":"UP"}` at
  `http://localhost:3000/health`.

## Developer commands

Run from the project folder:

```sh
pnpm dev          # Start the web app and API
pnpm build        # Build the workspace
pnpm lint         # Lint workspace packages
pnpm check-types  # Check TypeScript types
```
## Please feel free to contribute or share feedback!

## Features to Contribute

1. **Support more video formats:** Add support for MOV, AVI, WebM, WMV, M4V,
   and 3GP files.
2. **Improve the waiting experience:** Make the UI more engaging and
   informative while videos are processing, especially when processing takes
   a long time.
3. **Preserve progress across reloads:** Processing progress is not currently
   persistent. Reloading the page loses the current job and its progress, so
   users may need to start the upload and processing again. Persist jobs and
   let users return to check progress and download the finished video.
4. **You can add a option to download .srt file for the same video**
