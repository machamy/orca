// Injected by electron.vite.config.ts; absent in the web and CLI bundles.
declare const ORCA_INTERNAL_UPDATE_FEED_URL: string | null | undefined

/** Fork: fixed at build time so an open-source build can never carry the internal update folder. */
export const INTERNAL_UPDATE_FEED_URL =
  typeof ORCA_INTERNAL_UPDATE_FEED_URL === 'string' ? ORCA_INTERNAL_UPDATE_FEED_URL : null

export const IS_INTERNAL_BUILD = INTERNAL_UPDATE_FEED_URL !== null
