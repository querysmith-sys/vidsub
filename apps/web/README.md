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

The app streams video uploads through the API, which forwards them to Google
Drive and returns the resulting file ID. This avoids browser CORS restrictions
on Google's resumable-upload response. The API also handles transcription-job
status and download routes.

MP4 and MKV input videos are accepted. MKV files are processed in their original
container format and the subtitled result is still packaged as MP4.
