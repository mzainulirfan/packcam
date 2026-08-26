import type { KeyboardEvent, RefObject } from 'react'

import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

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
    <div className="scan-opencode__barcode grid gap-4">
      <div className="scan-opencode__field grid gap-2">
        <Label htmlFor="barcode-input">
          Barcode scanner
        </Label>
        <Input
          id="barcode-input"
          ref={inputRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="scan-opencode__input"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" className="scan-opencode__button flex-1" onClick={onSubmit}>
          [process-scan]
        </Button>
        <Button type="button" variant="outline" className="scan-opencode__button flex-1" onClick={onClear}>
          [clear]
        </Button>
      </div>
    </div>
  )
}
