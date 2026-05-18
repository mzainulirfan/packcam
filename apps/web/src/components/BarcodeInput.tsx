import type { KeyboardEvent, RefObject } from 'react'

import { ScanLine, Trash2 } from 'lucide-react'

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
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="barcode-input" className="text-xs uppercase tracking-[0.18em] text-slate-500">
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
          className="h-12"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" className="flex-1" onClick={onSubmit}>
          <ScanLine className="size-4" />
          Proses scan
        </Button>
        <Button type="button" variant="outline" className="flex-1 border-slate-200" onClick={onClear}>
          <Trash2 className="size-4" />
          Bersihkan
        </Button>
      </div>
    </div>
  )
}
