// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SOURCE_CONTROL_REVIEW_FILTER_PRESET,
  SourceControlFilterPreset
} from './SourceControlFilterPreset'
import { getSourceControlFileFilterState } from '../listing/file-filter'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

function render(filterQuery: string, onChange: (q: string) => void): HTMLButtonElement {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() =>
    root?.render(
      <SourceControlFilterPreset filterQuery={filterQuery} onFilterQueryChange={onChange} />
    )
  )
  const button = container.querySelector('button')
  if (!button) {
    throw new Error('preset chip not rendered')
  }
  return button
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
})

describe('SourceControlFilterPreset', () => {
  it('sets the review query when idle', () => {
    const onChange = vi.fn()
    // Why render outside act: nesting it inside the click's act defers the commit
    // to the outer act, so the button does not exist yet when we look for it.
    const button = render('', onChange)
    act(() => button.click())
    expect(onChange).toHaveBeenCalledWith(SOURCE_CONTROL_REVIEW_FILTER_PRESET)
  })

  it('clears the query when it is already the preset, so the chip is a toggle', () => {
    const onChange = vi.fn()
    const button = render(SOURCE_CONTROL_REVIEW_FILTER_PRESET, onChange)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    act(() => button.click())
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('sets a query the filter parses as extensions, not as a substring', () => {
    // The chip's whole point: `.cs` must not drag in `.cs.meta` and `.csproj`.
    const state = getSourceControlFileFilterState(SOURCE_CONTROL_REVIEW_FILTER_PRESET)
    expect(state.extensionSuffixes).toEqual(['.cs', '.json', '.md'])
  })
})
