import type { KeyboardEvent, RefObject } from 'react'

type BarcodeInputProps = {
  inputRef: RefObject<HTMLInputElement | null>
  value: string
  onValueChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onSubmit: () => void
  onClear: () => void
  placeholder?: string
}

export function BarcodeInput({
  inputRef,
  value,
  onValueChange,
  onKeyDown,
  onSubmit,
  onClear,
  placeholder = 'Scan resi lalu tekan Enter',
}: BarcodeInputProps) {
  return (
    <div className="barcode-input">
      <label className="barcode-input__label">
        <span>Barcode scanner</span>
        <input
          ref={inputRef}
          className="barcode-input__field"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
        />
      </label>

      <div className="barcode-input__actions">
        <button type="button" className="action-button action-button--primary" onClick={onSubmit}>
          Proses scan
        </button>
        <button type="button" className="action-button" onClick={onClear}>
          Bersihkan
        </button>
      </div>
    </div>
  )
}
