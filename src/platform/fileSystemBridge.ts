import { isDesktopRuntime } from './runtime'
import { openNativeDirectoryPicker } from './tauriBridge'

export type DirectorySelectionResult = {
  label: string
  path: string | null
}

export async function choosePackcamDirectory(): Promise<DirectorySelectionResult | null> {
  if (typeof window === 'undefined') {
    return null
  }

  const pickerWindow = window as Window & {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
  }

  if (typeof pickerWindow.showDirectoryPicker === 'function') {
    const folderHandle = await pickerWindow.showDirectoryPicker()
    return {
      label: folderHandle.name,
      path: folderHandle.name,
    }
  }

  if (isDesktopRuntime()) {
    const path = await openNativeDirectoryPicker()

    if (!path) {
      return null
    }

    const label = path.split(/[\\/]/).filter(Boolean).pop() || path

    return {
      label,
      path,
    }
  }

  return null
}
