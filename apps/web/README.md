# VidSub web app

## API connection

For local development, the frontend sends API requests directly to
`http://localhost:3000`. Copy `.env.example` to `.env.local` and set
`VITE_API_ORIGIN` to your backend origin if it is hosted elsewhere.

For a separately hosted frontend, set `VITE_API_ORIGIN` to the API origin, for
example `https://api.example.com`, when building the web app. The API must allow
the frontend's exact origin in its CORS configuration, for example
`https://vidsub.example.com`. Separate multiple origins with commas. Origins
must not include a path or trailing slash.

The app uses the API for upload URL creation and transcription-job status and
download routes. The video bytes are uploaded directly to the resumable URL
returned by Google Drive.
