import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent, SyntheticEvent } from 'react'
import { Icon, Navbar } from '../components/navbar'

type WorkflowStage = 'upload' | 'processing' | 'ready'
type JobStatus = 'queued' | 'processing' | 'ready' | 'failed'

interface ApiErrorResponse {
  message?: string
  error?: string
}

interface UploadUrlResponse {
  success: boolean
  url?: string
  message?: string
}

interface JobStartResponse {
  success: boolean
  data?: {
    jobId?: string
    status?: JobStatus
    statusUrl?: string
    downloadUrl?: string
  }
  message?: string
}

interface JobStatusResponse {
  success: boolean
  data?: {
    status?: JobStatus
    downloadUrl?: string
    error?: string
  }
  message?: string
}

const MAX_VIDEO_DURATION_SECONDS = 30 * 60
const POLL_INTERVAL_MS = 2500
const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? 'http://localhost:3000').replace(/\/$/u, '')
const SUPPORTED_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.mkv', '.webm']
const VIDEO_MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
}

function apiUrl(path: string) {
  if (/^https?:\/\//iu.test(path)) return path
  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiUrl(url), init)
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        'Could not reach the VidSub API. Check VITE_API_ORIGIN and ensure the API allows this frontend origin in CORS_ORIGINS.',
        { cause: error },
      )
    }
    throw error
  }
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const body = payload as ApiErrorResponse | null
    throw new Error(body?.message ?? body?.error ?? `Request failed (${response.status}).`)
  }
  if (payload === null) {
    throw new Error('The server returned an empty or invalid response.')
  }
  return payload as T
}

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function getFileExtension(name: string) {
  const dotIndex = name.lastIndexOf('.')
  return dotIndex < 0 ? '' : name.slice(dotIndex).toLowerCase()
}

function getVideoMimeType(file: File) {
  return file.type || VIDEO_MIME_TYPES[getFileExtension(file.name)] || 'application/octet-stream'
}

function UploadGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none">
      <path d="M24 31V10m0 0-8 8m8-8 8 8" />
      <path d="M10 28v8a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3v-8" />
      <path d="M17 31h.01M31 31h.01" />
    </svg>
  )
}

function FilmGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M7 4v16M17 4v16M3 9h4m-4 6h4m10-6h4m-4 6h4" />
    </svg>
  )
}

function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const requestSequence = useRef(0)
  const [stage, setStage] = useState<WorkflowStage>('upload')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [duration, setDuration] = useState<number | null>(null)
  const [metadataChecked, setMetadataChecked] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadLabel, setUploadLabel] = useState('Preparing your video')
  const [jobStatus, setJobStatus] = useState<JobStatus>('queued')
  const [jobId, setJobId] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [activeDialog, setActiveDialog] = useState<'help' | 'settings' | null>(null)

  useEffect(() => {
    return () => {
      requestSequence.current += 1
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    if (stage !== 'processing') return
    const timer = window.setInterval(() => {
      setElapsedMs((current) => current + 1000)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [stage])

  const chooseFile = (file?: File) => {
    if (!file) return
    const extension = getFileExtension(file.name)
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      setErrorMessage('Choose an MP4, MOV, M4V, MKV, or WebM video.')
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setDuration(null)
    setMetadataChecked(false)
    setErrorMessage('')
  }

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    chooseFile(event.target.files?.[0])
    event.target.value = ''
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    chooseFile(event.dataTransfer.files[0])
  }

  const onVideoMetadata = (event: SyntheticEvent<HTMLVideoElement>) => {
    const videoDuration = event.currentTarget.duration
    setMetadataChecked(true)
    if (!Number.isFinite(videoDuration) || videoDuration <= 0) {
      setErrorMessage('We could not read the video duration. Try another video file.')
      setDuration(null)
      return
    }
    if (videoDuration > MAX_VIDEO_DURATION_SECONDS) {
      setErrorMessage('Videos must be 30 minutes or shorter.')
      setDuration(videoDuration)
      return
    }
    setDuration(videoDuration)
    setErrorMessage('')
  }

  const runUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedFile || !metadataChecked || duration === null || errorMessage || isWorking) return

    const sequence = requestSequence.current + 1
    requestSequence.current = sequence
    setIsWorking(true)
    setStage('upload')
    setErrorMessage('')
    setUploadProgress(0)
    setUploadLabel('Preparing secure upload')
    setElapsedMs(0)

    try {
      const uploadInfo = await fetchJson<UploadUrlResponse>('/api/upload/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mimeType: getVideoMimeType(selectedFile),
          fileSize: String(selectedFile.size),
          fileName: selectedFile.name,
        }),
      })
      const uploadUrl = uploadInfo.url
      if (!uploadUrl) throw new Error(uploadInfo.message ?? 'The server did not provide an upload URL.')

      setUploadLabel('Uploading video to secure storage')
      const fileId = await new Promise<string>((resolve, reject) => {
        const request = new XMLHttpRequest()
        request.open('PUT', uploadUrl)
        request.setRequestHeader('Content-Type', getVideoMimeType(selectedFile))
        request.upload.onprogress = (progressEvent) => {
          if (!progressEvent.lengthComputable) return
          setUploadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
        }
        request.onerror = () => reject(new Error('Upload could not connect. Check your network and try again.'))
        request.onabort = () => reject(new Error('Upload was interrupted. Please try again.'))
        request.onload = () => {
          if (request.status < 200 || request.status >= 300) {
            reject(new Error(`Video upload failed (${request.status}).`))
            return
          }
          try {
            const response: unknown = JSON.parse(request.responseText)
            if (typeof response !== 'object' || response === null || !('id' in response) || typeof response.id !== 'string') {
              reject(new Error('The storage service did not return a video ID.'))
              return
            }
            resolve(response.id)
          } catch {
            reject(new Error('The storage service returned an invalid upload response.'))
          }
        }
        request.send(selectedFile)
      })

      if (requestSequence.current !== sequence) return
      setUploadProgress(100)
      setUploadLabel('Upload complete')

      const started = await fetchJson<JobStartResponse>(
        `/api/transcription/extract?fileId=${encodeURIComponent(fileId)}`,
      )
      const job = started.data
      if (!job?.jobId || !job.statusUrl || !job.downloadUrl) {
        throw new Error(started.message ?? 'The server did not return complete transcription job details.')
      }

      setJobId(job.jobId)
      setDownloadUrl(job.downloadUrl)
      setJobStatus(job.status ?? 'queued')
      setStage('processing')
      setUploadLabel('Video uploaded')
      setElapsedMs(0)

      let nextStatus: JobStatus = job.status ?? 'queued'
      if (nextStatus === 'ready') {
        setStage('ready')
      }
      if (nextStatus === 'failed') {
        throw new Error('The video could not be processed.')
      }
      while (nextStatus !== 'ready' && nextStatus !== 'failed') {
        await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS))
        if (requestSequence.current !== sequence) return
        const statusResponse = await fetchJson<JobStatusResponse>(apiUrl(job.statusUrl))
        const status = statusResponse.data?.status
        if (!status || !['queued', 'processing', 'ready', 'failed'].includes(status)) {
          throw new Error('The server returned an unrecognized job status.')
        }
        nextStatus = status
        setJobStatus(status)
        if (status === 'ready') {
          setDownloadUrl(statusResponse.data?.downloadUrl ?? job.downloadUrl)
          setStage('ready')
          break
        }
        if (status === 'failed') {
          throw new Error(statusResponse.data?.error ?? 'The video could not be processed.')
        }
      }
    } catch (error) {
      if (requestSequence.current !== sequence) return
      setErrorMessage(getErrorMessage(error))
      setStage('upload')
    } finally {
      if (requestSequence.current === sequence) setIsWorking(false)
    }
  }

  const resetWorkflow = () => {
    requestSequence.current += 1
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setStage('upload')
    setSelectedFile(null)
    setPreviewUrl('')
    setDuration(null)
    setMetadataChecked(false)
    setIsWorking(false)
    setUploadProgress(0)
    setUploadLabel('Preparing your video')
    setJobStatus('queued')
    setJobId('')
    setDownloadUrl('')
    setElapsedMs(0)
    setErrorMessage('')
  }

  const statusCopy = jobStatus === 'queued'
    ? 'Your video is in the processing queue.'
    : 'Transcribing speech, translating to English, and adding a selectable subtitle track.'

  return (
    <div className="app-shell">
      <Navbar
        stage={stage}
        onHelp={() => setActiveDialog('help')}
        onSettings={() => setActiveDialog('settings')}
      />

      <main className="main-content">
        {stage === 'upload' && (
          <section className="upload-screen" aria-labelledby="page-title">
            <div className="eyebrow"><span className="eyebrow-dot" /> VIDEO SUBTITLE WORKSPACE</div>
            <h1 id="page-title">Make every word <span>understood.</span></h1>
            <p className="page-description">
              Turn your video speech into clear English subtitles, timed to the original audio.
            </p>

            <form className="upload-layout" onSubmit={runUpload}>
              <div className="upload-card">
                <div
                  className={`dropzone${isDragging ? ' is-dragging' : ''}${selectedFile ? ' has-file' : ''}`}
                  onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false)
                  }}
                  onDrop={onDrop}
                  role="region"
                  aria-label="Video upload dropzone"
                >
                  {selectedFile ? (
                    <>
                      <div className="file-icon"><FilmGlyph /></div>
                      <div className="selected-file-name" title={selectedFile.name}>{selectedFile.name}</div>
                      <div className="file-meta">
                        <span>{formatBytes(selectedFile.size)}</span>
                        {duration !== null && <><span className="meta-separator" /><span>{formatDuration(duration)}</span></>}
                      </div>
                      {!metadataChecked && <div className="metadata-check"><span className="mini-spinner" /> Checking video details…</div>}
                      {previewUrl && (
                        <video
                          className="metadata-video"
                          src={previewUrl}
                          preload="metadata"
                          onLoadedMetadata={onVideoMetadata}
                          onError={() => {
                            setMetadataChecked(true)
                            setErrorMessage('This video could not be opened. Try a supported format.')
                          }}
                        />
                      )}
                      <button className="text-button" type="button" onClick={resetWorkflow} disabled={isWorking}>Choose a different video</button>
                    </>
                  ) : (
                    <>
                      <div className="upload-icon"><UploadGlyph /></div>
                      <h2>Drop your video here</h2>
                      <p>or choose a file from your device</p>
                      <button className="button button-secondary choose-button" type="button" onClick={() => inputRef.current?.click()}>
                        Choose video
                      </button>
                      <span className="dropzone-footnote">Your original video stays unchanged</span>
                    </>
                  )}
                  <input
                    ref={inputRef}
                    className="visually-hidden"
                    type="file"
                    accept={SUPPORTED_EXTENSIONS.join(',')}
                    onChange={onFileInput}
                    aria-label="Choose a video file"
                  />
                </div>

                <div className="upload-card-footer">
                  <div className="format-list">
                    <span className="footer-label">SUPPORTED</span>
                    <span>MP4</span><span>MOV</span><span>M4V</span><span>MKV</span><span>WEBM</span>
                  </div>
                  <span className="duration-limit"><Icon name="clock" size={14} /> Up to 30 min</span>
                </div>

                {errorMessage && (
                  <div className="alert alert-error" role="alert">
                    <span className="alert-symbol">!</span>
                    <span>{errorMessage}</span>
                  </div>
                )}

                {isWorking && stage === 'upload' && (
                  <div className="upload-progress" aria-live="polite">
                    <div className="progress-copy"><span>{uploadLabel}</span><strong>{uploadProgress}%</strong></div>
                    <div className="progress-track"><span style={{ width: `${uploadProgress}%` }} /></div>
                  </div>
                )}

                <button
                  className="button button-primary start-button"
                  type="submit"
                  disabled={!selectedFile || !metadataChecked || duration === null || Boolean(errorMessage) || isWorking}
                >
                  {isWorking ? 'Starting your subtitles…' : 'Generate subtitles'}
                  {!isWorking && <Icon name="arrow" size={17} />}
                </button>
                <p className="privacy-note"><span className="lock-icon">⌑</span> Secure upload · Temporary files auto-remove after 1 hour</p>
              </div>

              <aside className="upload-aside">
                <div className="aside-card">
                  <div className="aside-icon"><Icon name="sparkle" size={19} /></div>
                  <h3>From speech to subtitles</h3>
                  <p>VidSub transcribes your audio, translates it into English, and adds a selectable subtitle track to a new video file.</p>
                  <div className="aside-divider" />
                  <div className="aside-feature"><span className="feature-check"><Icon name="check" size={12} /></span><span>Timed to the spoken audio</span></div>
                  <div className="aside-feature"><span className="feature-check"><Icon name="check" size={12} /></span><span>Soft subtitles you can turn on or off</span></div>
                  <div className="aside-feature"><span className="feature-check"><Icon name="check" size={12} /></span><span>Original video and audio preserved</span></div>
                </div>
                <div className="support-note">
                  <span className="support-note-icon">i</span>
                  <p>Processing time depends on video length. You can keep this page open while your subtitles are being prepared.</p>
                </div>
              </aside>
            </form>
          </section>
        )}

        {stage === 'processing' && (
          <section className="workspace-screen" aria-labelledby="processing-title">
            <div className="screen-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-dot is-processing" /> IN PROGRESS <span className="heading-divider">/</span> JOB {jobId.slice(0, 8).toUpperCase()}</div>
                <h1 id="processing-title">Your subtitles are in the works.</h1>
                <p className="page-description">We’re listening to the speech and carefully timing the English translation.</p>
              </div>
              <div className="elapsed-badge"><Icon name="clock" size={15} /> {formatElapsed(elapsedMs)} elapsed</div>
            </div>

            <div className="processing-layout">
              <div className="preview-card">
                <div className="card-heading">
                  <div><span className="card-kicker">SOURCE VIDEO</span><strong>{selectedFile?.name}</strong></div>
                  <span className="status-pill"><span className="status-dot" /> Original</span>
                </div>
                {previewUrl && <video className="video-preview" src={previewUrl} controls preload="metadata" />}
                <div className="preview-meta"><span>{duration === null ? 'Video' : formatDuration(duration)}</span><span>{selectedFile ? formatBytes(selectedFile.size) : ''}</span></div>
              </div>

              <aside className="processing-panel">
                <div className="panel-heading">
                  <div><span className="card-kicker">PROCESSING</span><h2>Making your subtitles</h2></div>
                  <span className="processing-indicator"><span className="mini-spinner" /></span>
                </div>
                <p className="processing-summary">{statusCopy}</p>
                <div className="timeline">
                  <div className="timeline-item is-done">
                    <span className="timeline-marker"><Icon name="check" size={13} /></span>
                    <div><strong>Video uploaded</strong><span>Stored securely for this job</span></div>
                  </div>
                  <div className="timeline-item is-active">
                    <span className="timeline-marker"><span className="mini-spinner" /></span>
                    <div><strong>Transcribe & translate</strong><span>Speech recognition and English translation</span></div>
                  </div>
                  <div className="timeline-item">
                    <span className="timeline-marker">3</span>
                    <div><strong>Add subtitle track</strong><span>Packaging a downloadable MP4</span></div>
                  </div>
                </div>
                <div className="processing-footnote">
                  <Icon name="clock" size={15} />
                  <span>Step-by-step progress isn’t available yet. This status updates automatically.</span>
                </div>
                <div className="processing-file">
                  <div className="file-icon small"><FilmGlyph /></div>
                  <div className="processing-file-details"><strong>{selectedFile?.name}</strong><span>{selectedFile ? formatBytes(selectedFile.size) : ''}</span></div>
                  <span className="file-ready-label">{jobStatus === 'queued' ? 'In queue' : 'Processing'}</span>
                </div>
              </aside>
            </div>
          </section>
        )}

        {stage === 'ready' && (
          <section className="workspace-screen" aria-labelledby="ready-title">
            <div className="screen-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-dot is-ready" /> SUBTITLES READY <span className="heading-divider">/</span> JOB {jobId.slice(0, 8).toUpperCase()}</div>
                <h1 id="ready-title">Your video is ready.</h1>
                <p className="page-description">The English subtitle track is included in the MP4 and can be turned on or off in a compatible player.</p>
              </div>
              <a className="button button-primary download-button" href={apiUrl(downloadUrl)} download="translated-video.mp4">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 13v3h12v-3" /></svg>
                Download video
              </a>
            </div>

            <div className="processing-layout ready-layout">
              <div className="preview-card output-preview-card">
                <div className="card-heading">
                  <div><span className="card-kicker">SUBTITLED VIDEO</span><strong>{selectedFile?.name.replace(/\.[^.]+$/u, '')}_subtitled.mp4</strong></div>
                  <span className="status-pill is-ready"><span className="status-dot" /> Ready</span>
                </div>
                {downloadUrl && <video className="video-preview output-video" src={apiUrl(downloadUrl)} controls preload="metadata" />}
                <div className="preview-meta"><span>MP4 · English soft subtitles</span><span>{selectedFile ? formatBytes(selectedFile.size) : ''}</span></div>
              </div>

              <aside className="processing-panel export-panel">
                <div className="export-success-icon"><Icon name="check" size={21} /></div>
                <span className="card-kicker">EXPORT COMPLETE</span>
                <h2>Ready to watch and share.</h2>
                <p className="export-copy">Your original picture and audio are preserved. The English captions are a selectable subtitle track, not burned into the image.</p>
                <div className="export-detail">
                  <span className="export-detail-icon"><Icon name="check" size={14} /></span>
                  <div><strong>English subtitle track</strong><span>Soft subtitles · On by default</span></div>
                </div>
                <div className="export-detail">
                  <span className="export-detail-icon"><FilmGlyph /></span>
                  <div><strong>MP4 video</strong><span>Download available for 1 hour</span></div>
                </div>
                <a className="button button-primary export-download" href={apiUrl(downloadUrl)} download="translated-video.mp4">
                  Download subtitled video <Icon name="arrow" size={17} />
                </a>
                <p className="player-note">If captions aren’t visible in your player, open its subtitle menu and select English. VLC supports the embedded track.</p>
              </aside>
            </div>
            <div className="new-video-row">
              <span>Have another video?</span>
              <button className="text-button" type="button" onClick={resetWorkflow}>Start a new subtitle job <Icon name="arrow" size={15} /></button>
            </div>
          </section>
        )}
      </main>

      <footer className="app-footer">
        <span>© 2026 VidSub</span>
        <span className="footer-status"><span className="footer-status-dot" /> Files processed securely</span>
        <span>English subtitles, in sync.</span>
      </footer>

      {activeDialog && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setActiveDialog(null)
        }}>
          <section className="info-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <button className="dialog-close" type="button" onClick={() => setActiveDialog(null)} aria-label="Close dialog">×</button>
            {activeDialog === 'help' ? (
              <>
                <span className="dialog-icon"><Icon name="help" size={20} /></span>
                <div className="card-kicker">VIDSUB SUPPORT</div>
                <h2 id="dialog-title">A little help</h2>
                <p>Choose a video up to 30 minutes long. Keep this page open while it uploads and processes. When it’s ready, download the MP4 and enable the English subtitle track in your video player.</p>
                <div className="dialog-tip"><strong>Can’t see the subtitles?</strong><span>In VLC, open Subtitle → Sub Track and select English.</span></div>
              </>
            ) : (
              <>
                <span className="dialog-icon"><Icon name="settings" size={20} /></span>
                <div className="card-kicker">WORKSPACE SETTINGS</div>
                <h2 id="dialog-title">Your project limits</h2>
                <div className="settings-row"><span>Maximum video length</span><strong>30 minutes</strong></div>
                <div className="settings-row"><span>Subtitle language</span><strong>English</strong></div>
                <div className="settings-row"><span>Subtitle format</span><strong>Selectable track in MP4</strong></div>
                <p className="settings-note">Appearance and transcript editing aren’t available in this version.</p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default UploadPage
