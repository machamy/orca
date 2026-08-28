import { beforeEach, describe, expect, it, vi } from 'vitest'

const { gitExecFileAsyncMock } = vi.hoisted(() => ({ gitExecFileAsyncMock: vi.fn() }))

vi.mock('./runner', () => ({ gitExecFileAsync: gitExecFileAsyncMock }))

import { clearGitCapabilityStateForTests } from './git-capability-state'
import { ensureWorktreeRepairSupported } from './worktree-repair-capability'

function unsupportedRepair(): Error {
  return Object.assign(new Error("unknown subcommand: 'repair'"), {
    stderr: "error: unknown subcommand: 'repair'"
  })
}

describe('worktree repair Git capability', () => {
  beforeEach(() => {
    clearGitCapabilityStateForTests()
    gitExecFileAsyncMock.mockReset()
  })

  it('falls back once and remembers an unsupported local Git', async () => {
    gitExecFileAsyncMock.mockRejectedValue(unsupportedRepair())

    await expect(ensureWorktreeRepairSupported('/repo-a', {})).rejects.toThrow(
      'default_worktree_switch_git_repair_unsupported'
    )
    await expect(ensureWorktreeRepairSupported('/repo-b', {})).rejects.toThrow(
      'default_worktree_switch_git_repair_unsupported'
    )

    expect(gitExecFileAsyncMock).toHaveBeenCalledTimes(1)
  })

  it('shares one concurrent capability probe', async () => {
    let rejectProbe!: (error: Error) => void
    gitExecFileAsyncMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectProbe = reject
      })
    )

    const first = ensureWorktreeRepairSupported('/repo-a', {})
    const second = ensureWorktreeRepairSupported('/repo-b', {})
    rejectProbe(unsupportedRepair())

    await expect(first).rejects.toThrow('default_worktree_switch_git_repair_unsupported')
    await expect(second).rejects.toThrow('default_worktree_switch_git_repair_unsupported')
    expect(gitExecFileAsyncMock).toHaveBeenCalledTimes(1)
  })

  it('keeps native and WSL repair capabilities isolated', async () => {
    gitExecFileAsyncMock.mockImplementation((_args: string[], options: { wslDistro?: string }) =>
      options.wslDistro ? Promise.resolve({ stdout: '' }) : Promise.reject(unsupportedRepair())
    )

    await expect(ensureWorktreeRepairSupported('/native', {})).rejects.toThrow(
      'default_worktree_switch_git_repair_unsupported'
    )
    await expect(
      ensureWorktreeRepairSupported('/wsl', { wslDistro: 'Ubuntu' })
    ).resolves.toBeUndefined()

    expect(gitExecFileAsyncMock.mock.calls.map(([, options]) => options.wslDistro)).toEqual([
      undefined,
      'Ubuntu'
    ])
  })
})
