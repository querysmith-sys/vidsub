type WorkflowStage = 'upload' | 'processing' | 'ready'

const steps = ['Upload', 'Transcribe', 'Translate', 'Subtitle']

export function Icon({
  name,
  size = 18,
}: {
  name: 'help' | 'settings' | 'sparkle' | 'arrow' | 'check' | 'clock'
  size?: number
}) {
  const paths = {
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.6 9a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.2-2.4 3.7" />
        <path d="M12 17.2h.01" />
      </>
    ),
    settings: (
      <>
        <path d="M12 8.1a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8Z" />
        <path d="m19.4 15 .1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 1 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 1 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 1 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 1 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" />
      </>
    ),
    sparkle: (
      <>
        <path d="m12 3 1.3 5.7L19 10l-5.7 1.3L12 17l-1.3-5.7L5 10l5.7-1.3L12 3Z" />
        <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

export function Navbar({
  stage,
  onHelp,
  onSettings,
}: {
  stage: WorkflowStage
  onHelp: () => void
  onSettings: () => void
}) {
  const activeStep = stage === 'upload' ? 0 : stage === 'processing' ? 1 : 3

  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="VidSub home">
        <span className="brand-mark">
          <Icon name="sparkle" size={20} />
        </span>
        <span>vidsub</span>
      </a>

      <nav className="workflow-nav" aria-label="Subtitle workflow">
        {steps.map((step, index) => {
          const completed = index < activeStep
          const active = index === activeStep || (stage === 'ready' && index === 2)
          return (
            <div
              className={`workflow-step${completed ? ' is-complete' : ''}${active ? ' is-active' : ''}`}
              key={step}
              aria-current={active ? 'step' : undefined}
            >
              <span className="step-marker">
                {completed ? <Icon name="check" size={13} /> : String(index + 1).padStart(2, '0')}
              </span>
              <span>{step}</span>
              {index < steps.length - 1 && <span className="step-connector" aria-hidden="true" />}
            </div>
          )
        })}
      </nav>

      <div className="topbar-actions">
        <button className="icon-button" type="button" onClick={onSettings} aria-label="Settings">
          <Icon name="settings" />
          <span className="action-label">Settings</span>
        </button>
        <button className="icon-button" type="button" onClick={onHelp} aria-label="Help">
          <Icon name="help" />
          <span className="action-label">Help</span>
        </button>
        <span className="account-avatar" aria-label="VidSub workspace">V</span>
      </div>
    </header>
  )
}
