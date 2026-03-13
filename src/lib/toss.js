import {
  Analytics,
  Storage,
  closeView,
  env,
  getAppsInTossGlobals,
  openURL,
  share,
} from '@apps-in-toss/web-framework'

function hasBrowser() {
  return typeof window !== 'undefined'
}

function hasReactNativeWebView() {
  return hasBrowser() && typeof window.ReactNativeWebView?.postMessage === 'function'
}

function hasConstantHandlers() {
  return hasBrowser() && typeof window.__CONSTANT_HANDLER_MAP === 'object'
}

function canUseTossBridge() {
  return hasReactNativeWebView() && hasConstantHandlers()
}

function safeSync(action, fallbackValue = null) {
  try {
    return action()
  } catch {
    return fallbackValue
  }
}

async function safeAsync(action, fallbackValue = null) {
  try {
    return await action()
  } catch {
    return fallbackValue
  }
}

export function getRuntimeContext() {
  const globals = canUseTossBridge() ? safeSync(() => getAppsInTossGlobals(), null) : null
  const deploymentId = canUseTossBridge() ? safeSync(() => env.getDeploymentId(), '') : ''

  return {
    isTossApp: canUseTossBridge(),
    deploymentId,
    globals,
  }
}

export async function readAppStorage(key) {
  if (canUseTossBridge()) {
    const value = await safeAsync(() => Storage.getItem(key), null)
    if (typeof value === 'string') {
      return value
    }
  }

  if (!hasBrowser()) {
    return null
  }

  return safeSync(() => window.localStorage.getItem(key), null)
}

export async function writeAppStorage(key, value) {
  if (canUseTossBridge()) {
    await safeAsync(() => Storage.setItem(key, value))
  }

  if (!hasBrowser()) {
    return
  }

  safeSync(() => window.localStorage.setItem(key, value))
}

export function trackScreen(logName, params = {}) {
  if (!canUseTossBridge()) {
    return
  }

  safeSync(() => Analytics.screen({ log_name: logName, ...params }))
}

export function trackClick(logName, params = {}) {
  if (!canUseTossBridge()) {
    return
  }

  safeSync(() => Analytics.click({ log_name: logName, ...params }))
}

export async function shareText(message) {
  if (canUseTossBridge()) {
    const shared = await safeAsync(() => share({ message }), false)
    if (shared !== false) {
      return true
    }
  }

  if (hasBrowser() && typeof navigator.share === 'function') {
    const shared = await safeAsync(() => navigator.share({ text: message }), false)
    if (shared !== false) {
      return true
    }
  }

  if (hasBrowser() && navigator.clipboard?.writeText) {
    const copied = await safeAsync(() => navigator.clipboard.writeText(message), false)
    if (copied !== false) {
      return true
    }
  }

  return false
}

export async function openExternalUrl(url) {
  if (canUseTossBridge()) {
    const opened = await safeAsync(() => openURL(url), false)
    if (opened !== false) {
      return true
    }
  }

  if (!hasBrowser()) {
    return false
  }

  safeSync(() => window.open(url, '_blank', 'noopener,noreferrer'))
  return true
}

export async function closeMiniApp() {
  if (!canUseTossBridge()) {
    return false
  }

  const closed = await safeAsync(() => closeView(), false)
  return closed !== false
}
