import { useEffect, type RefObject } from 'react'

/**
 * Tells a wrapper (the Agent Map's lazy context-menu host) that the menu it
 * opened is finished with the screen. "Finished" is not "closed": a dialog the
 * menu spawned — the project-group name prompt, the parent picker, the fork's
 * Unity seed-first confirm — outlives the menu, and unmounting the wrapper
 * under one destroys it mid-question. Anything still live keeps the gate shut.
 */
export function useWorktreeContextMenuLifecycleComplete(args: {
  onLifecycleComplete?: () => void
  menuOpen: boolean
  createGroupDialogOpen: boolean
  createGroupDialogActiveRef: RefObject<boolean>
  parentPicker: unknown
  pendingParentPickerRef: RefObject<unknown>
  lifecycleStartedRef: RefObject<boolean>
  /** OR-ed pending flags from menu-owned dialogs that outlive the menu. */
  dialogPending: boolean
}): void {
  const {
    onLifecycleComplete,
    menuOpen,
    createGroupDialogOpen,
    createGroupDialogActiveRef,
    parentPicker,
    pendingParentPickerRef,
    lifecycleStartedRef,
    dialogPending
  } = args
  useEffect(() => {
    if (!onLifecycleComplete) {
      return
    }
    if (menuOpen) {
      lifecycleStartedRef.current = true
    }
    if (
      !lifecycleStartedRef.current ||
      menuOpen ||
      createGroupDialogOpen ||
      createGroupDialogActiveRef.current ||
      parentPicker !== null ||
      pendingParentPickerRef.current !== null ||
      dialogPending
    ) {
      return
    }
    const timer = window.setTimeout(() => {
      if (createGroupDialogActiveRef.current || pendingParentPickerRef.current !== null) {
        return
      }
      lifecycleStartedRef.current = false
      onLifecycleComplete?.()
    }, 0)
    return () => window.clearTimeout(timer)
    // Refs are stable; the effect re-runs on the state that can close the gate.
  }, [
    createGroupDialogActiveRef,
    createGroupDialogOpen,
    dialogPending,
    lifecycleStartedRef,
    menuOpen,
    onLifecycleComplete,
    parentPicker,
    pendingParentPickerRef
  ])
}
