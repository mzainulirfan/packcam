declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string

export function getBuildInfo() {
  return {
    version: __APP_VERSION__,
    buildTime: __BUILD_TIME__,
  }
}
