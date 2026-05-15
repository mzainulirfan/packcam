import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

export type BarcodeScanResult = {
  value: string
  status: 'valid' | 'invalid'
  message: string
}

type UseBarcodeScannerOptions = {
  minLength?: number
  maxLength?: number
  onValidScan: (value: string) => void
  onInvalidScan?: (value: string, message: string) => void
}

function normalizeBarcode(value: string) {
  return value.trim()
}

function isAlphanumeric(value: string) {
  return /^[a-z0-9]+$/i.test(value)
}

function validateBarcode(value: string, minLength: number, maxLength: number) {
  const normalized = normalizeBarcode(value)

  if (!normalized) {
    return {
      ok: false,
      value: normalized,
      message: 'Resi tidak boleh kosong.',
    }
  }

  if (normalized.length < minLength) {
    return {
      ok: false,
      value: normalized,
      message: `Resi minimal ${minLength} karakter.`,
    }
  }

  if (normalized.length > maxLength) {
    return {
      ok: false,
      value: normalized,
      message: `Resi maksimal ${maxLength} karakter.`,
    }
  }

  if (!isAlphanumeric(normalized)) {
    return {
      ok: false,
      value: normalized,
      message: 'Resi hanya boleh berisi huruf dan angka.',
    }
  }

  return {
    ok: true,
    value: normalized,
    message: 'Resi valid.',
  }
}

export function useBarcodeScanner({
  minLength = 6,
  maxLength = 30,
  onValidScan,
  onInvalidScan,
}: UseBarcodeScannerOptions) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState('')
  const [result, setResult] = useState<BarcodeScanResult | null>(null)

  const rules = useMemo(
    () => [
      `Minimal ${minLength} karakter`,
      `Maksimal ${maxLength} karakter`,
      'Huruf dan angka saja',
    ],
    [maxLength, minLength],
  )

  useEffect(() => {
    const inputElement = inputRef.current
    inputElement?.focus()
  }, [])

  function focusInput() {
    inputRef.current?.focus()
  }

  function resetResult() {
    setResult(null)
  }

  function submitBarcode(rawValue: string) {
    const validation = validateBarcode(rawValue, minLength, maxLength)

    if (!validation.ok) {
      const nextResult: BarcodeScanResult = {
        value: validation.value,
        status: 'invalid',
        message: validation.message,
      }

      setResult(nextResult)
      onInvalidScan?.(validation.value, validation.message)
      return nextResult
    }

    const nextResult: BarcodeScanResult = {
      value: validation.value,
      status: 'valid',
      message: validation.message,
    }

    setResult(nextResult)
    onValidScan(validation.value)
    setValue('')
    return nextResult
  }

  function handleChange(nextValue: string) {
    setValue(nextValue)
    if (result?.status === 'invalid') {
      setResult(null)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()
    submitBarcode(value)
  }

  return {
    inputRef,
    value,
    result,
    rules,
    setValue: handleChange,
    submitBarcode,
    focusInput,
    resetResult,
    handleKeyDown,
  }
}
