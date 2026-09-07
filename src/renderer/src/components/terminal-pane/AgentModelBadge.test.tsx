// @vitest-environment happy-dom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The primitives are stubbed so the assertions are about this component's own
// wiring; `open` is surfaced as an attribute because the fork requirement is
// that a right-click opens the menu, which is our handler rather than Radix's.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children, open }: { children: ReactNode; open?: boolean }) => (
    <div data-testid="menu" data-open={open === true ? 'true' : 'false'}>
      {children}
    </div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  DropdownMenuRadioGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuRadioItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <button type="button" data-corner={value}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <span data-testid="tip">{children}</span>
  ),
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

import { AgentModelBadge } from './AgentModelBadge'

let root: Root | null = null
let container: HTMLDivElement | null = null

function render(node: ReactNode): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root?.render(node))
}

function badgeButton(): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>('button')
  if (!button) {
    throw new Error('badge button not rendered')
  }
  return button
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
})

describe('AgentModelBadge', () => {
  const observed = { modelLabel: 'Opus', effortLabel: 'High', observed: true }

  it('names the model and effort together', () => {
    render(
      <AgentModelBadge
        reading={observed}
        corner="bottom-right"
        onMoveToCorner={vi.fn()}
        onHide={vi.fn()}
      />
    )
    expect(badgeButton().textContent).toBe('Opus · High')
  })

  it('shows the model alone when the agent has no effort control', () => {
    render(
      <AgentModelBadge
        reading={{ modelLabel: 'Haiku', effortLabel: null, observed: true }}
        corner="bottom-right"
        onMoveToCorner={vi.fn()}
        onHide={vi.fn()}
      />
    )
    expect(badgeButton().textContent).toBe('Haiku')
  })

  it('opens its menu on right-click and swallows the browser context menu', () => {
    render(
      <AgentModelBadge
        reading={observed}
        corner="bottom-right"
        onMoveToCorner={vi.fn()}
        onHide={vi.fn()}
      />
    )
    expect(container?.querySelector('[data-testid="menu"]')?.getAttribute('data-open')).toBe(
      'false'
    )
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    act(() => {
      badgeButton().dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    expect(container?.querySelector('[data-testid="menu"]')?.getAttribute('data-open')).toBe('true')
  })

  it('offers every placeable corner', () => {
    render(
      <AgentModelBadge
        reading={observed}
        corner="bottom-right"
        onMoveToCorner={vi.fn()}
        onHide={vi.fn()}
      />
    )
    expect(
      [...(container?.querySelectorAll('[data-corner]') ?? [])].map((el) =>
        el.getAttribute('data-corner')
      )
    ).toEqual(['top-left', 'top-right', 'bottom-right'])
  })

  it('hides through the menu', () => {
    const onHide = vi.fn()
    render(
      <AgentModelBadge
        reading={observed}
        corner="top-left"
        onMoveToCorner={vi.fn()}
        onHide={onHide}
      />
    )
    const hide = [...(container?.querySelectorAll('button') ?? [])].find((el) =>
      el.textContent?.startsWith('Hide')
    )
    act(() => hide?.click())
    expect(onHide).toHaveBeenCalledTimes(1)
  })

  it('marks an unconfirmed reading and says why', () => {
    render(
      <AgentModelBadge
        reading={{ modelLabel: 'GPT-5.5', effortLabel: 'Extra high', observed: false }}
        corner="bottom-right"
        onMoveToCorner={vi.fn()}
        onHide={vi.fn()}
      />
    )
    expect(badgeButton().className).toContain('italic')
    expect(container?.querySelector('[data-testid="tip"]')?.textContent).toContain(
      'has not reported back'
    )
  })

  it('places itself in the corner it was given', () => {
    render(
      <AgentModelBadge
        reading={observed}
        corner="top-right"
        onMoveToCorner={vi.fn()}
        onHide={vi.fn()}
      />
    )
    expect(container?.querySelector('div.absolute')?.className).toContain('top-1 right-1')
  })
})
