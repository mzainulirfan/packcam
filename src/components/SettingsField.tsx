import type { InputHTMLAttributes } from 'react'

type SettingsFieldProps = {
  label: string
  description?: string
} & InputHTMLAttributes<HTMLInputElement>

export function SettingsField({ label, description, ...inputProps }: SettingsFieldProps) {
  return (
    <label className="settings-field">
      <span className="settings-field__label">{label}</span>
      <input className="settings-field__input" {...inputProps} />
      {description ? <small className="settings-field__help">{description}</small> : null}
    </label>
  )
}
