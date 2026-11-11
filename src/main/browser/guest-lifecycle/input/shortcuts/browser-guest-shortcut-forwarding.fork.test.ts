import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    BrowserWindow: class {
      webContents = new (class extends EventEmitter {
        send = vi.fn()
      })()
    },
    screen: { getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })) },
    webContents: { fromId: vi.fn() }
  }
})

import { BrowserWindow } from 'electron'
import { setupGuestShortcutForwarding } from './browser-guest-shortcut-forwarding'

function pressCtrlAltInPage(code: string, key: string) {
  const guest = new BrowserWindow().webContents
  const renderer = new BrowserWindow().webContents
  const cleanup = setupGuestShortcutForwarding({
    browserTabId: 'tab-1',
    guest,
    resolveRenderer: () => renderer,
    getKeybindings: () => ({})
  })
  const event: Electron.Event = { preventDefault: vi.fn(), defaultPrevented: false }
  const input: Electron.Input = {
    type: 'keyDown',
    code,
    key,
    meta: false,
    control: true,
    alt: true,
    shift: false,
    isAutoRepeat: false,
    isComposing: false,
    location: 0,
    modifiers: []
  }
  guest.emit('before-input-event', event, input)
  cleanup()
  return { prevented: vi.mocked(event.preventDefault).mock.calls.length > 0, renderer }
}

describe('Unity and Rider chords from a focused browser page (fork)', () => {
  // Ctrl+Alt is AltGr in a guest text field and its editability is unknowable here,
  // so forwarding would both type and launch; the chords stay with the page.
  it('leaves Ctrl+Alt+U and Ctrl+Alt+R entirely to the page', () => {
    const unity = pressCtrlAltInPage('KeyU', 'u')
    const rider = pressCtrlAltInPage('KeyR', 'r')

    expect(unity.prevented).toBe(false)
    expect(rider.prevented).toBe(false)
    expect(unity.renderer.send).not.toHaveBeenCalled()
    expect(rider.renderer.send).not.toHaveBeenCalled()
  })
})
