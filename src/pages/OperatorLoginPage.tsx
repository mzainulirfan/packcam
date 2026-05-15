import { useState } from 'react'
import { authOperatorByUsername } from '../app/operatorSession'
import { navigateTo } from '../app/uiState'
import { useSystemConfig } from '../data/systemConfig'

export function OperatorLoginPage() {
  const systemConfig = useSystemConfig()
  const [operatorName, setOperatorName] = useState('')
  const [operatorPassword, setOperatorPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('Masuk dengan username dan password akun yang sudah terdaftar.')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleLogin() {
    const name = operatorName.trim()
    const password = operatorPassword.trim()

    if (!name || !password) {
      setMessage('Username dan kata sandi wajib diisi.')
      return
    }

    setIsSubmitting(true)

    try {
      await authOperatorByUsername(name, password)
      navigateTo('scan')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal melakukan auth operator.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
        <section className="login-card">
          <div className="login-card__brand">
            <div className="login-card__logo" aria-hidden="true">
              {systemConfig.brandMark || systemConfig.appName.charAt(0).toUpperCase()}
            </div>
            <div className="login-card__brand-copy">
              <p className="login-card__eyebrow">{systemConfig.appName}</p>
              <h1>Login</h1>
            </div>
          </div>

          <p className="login-card__lead">
            {systemConfig.tagline}
          </p>

          <form
            className="login-form"
            onSubmit={(event) => {
              event.preventDefault()
              void handleLogin()
            }}
          >
            <label className="settings-field">
              <span className="settings-field__label">username</span>
              <input
                className="settings-field__input"
                value={operatorName}
                onChange={(event) => setOperatorName(event.target.value)}
                placeholder="Username"
                autoComplete="username"
              />
            </label>

            <label className="settings-field">
              <span className="settings-field__label">password</span>
              <div className="settings-password">
                <input
                  className="settings-field__input settings-password__input"
                  type={showPassword ? 'text' : 'password'}
                  value={operatorPassword}
                  onChange={(event) => setOperatorPassword(event.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="settings-password__toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  <i className={`bx ${showPassword ? 'bx-hide' : 'bx-show'}`} aria-hidden="true" />
                </button>
              </div>
            </label>

            <button
              type="submit"
              className="action-button action-button--primary login-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Memproses...' : 'Masuk'}
            </button>

            <p className="login-feedback">{message}</p>
          </form>
        </section>
    </div>
  )
}
