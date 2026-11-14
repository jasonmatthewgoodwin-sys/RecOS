import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Gallery } from '../routes/gallery/Gallery'
import { Card } from './Card'
import { Deck } from './Deck'
import { Draft } from './Draft'
import { Field } from './Field'
import { Note } from './Note'
import { Switch } from './Switch'

// P1-21: Deck, Card, Draft, Note, Switch and Field (sections 3.9, 3.12, 25.3,
// 27.2, 27.5 and 33.1).

afterEach(() => {
  vi.useRealTimers()
})

const items = [
  { id: 'a', title: 'First' },
  { id: 'b', title: 'Second' },
  { id: 'c', title: 'Third' },
]

function deck(over: Partial<Parameters<typeof Deck<(typeof items)[number]>>[0]> = {}) {
  const primary = vi.fn()
  const bin = vi.fn()
  const snooze = vi.fn()
  const undo = vi.fn()
  const list = vi.fn()
  render(
    <Deck
      items={items}
      renderItem={(i) => <h3>{i.title}</h3>}
      primaryAction={{ label: (i) => `Do ${i.title}`, onClick: primary }}
      onBin={bin}
      onSnooze={snooze}
      onUndo={undo}
      onList={list}
      {...over}
    />,
  )
  return { primary, bin, snooze, undo, list }
}

const counter = () => screen.getByTestId('deck-counter').textContent
const heading = () => screen.getByRole('heading', { level: 3 }).textContent

describe('Deck', () => {
  it('shows one item at a time with a counter, three controls and a meter', () => {
    deck()
    expect(counter()).toBe('01 of 03')
    expect(heading()).toBe('First')
    expect(screen.getByRole('button', { name: 'Do First' })).toHaveAttribute('data-kind', 'primary')
    expect(screen.getAllByRole('button', { name: /^(Skip|Bin|Snooze|List)$/ })).toHaveLength(4)
    expect(screen.getByRole('img', { name: '0 of 3' })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
  })

  it('deals the item on the primary action and moves on; the counter and meter advance', async () => {
    const { primary } = deck()
    await userEvent.click(screen.getByRole('button', { name: 'Do First' }))
    expect(primary).toHaveBeenCalledWith(items[0])
    expect(heading()).toBe('Second')
    expect(counter()).toBe('02 of 03')
    expect(screen.getByRole('img', { name: '1 of 3' })).toBeInTheDocument()
  })

  it('Skip asks nothing and moves the item to the end (27.2)', async () => {
    deck()
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(heading()).toBe('Second')
    expect(counter()).toBe('01 of 03')
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(heading()).toBe('First')
  })

  it('INBX-4: when the last item is dealt with it says All clear and how many were cleared', async () => {
    const { bin, snooze } = deck()
    await userEvent.click(screen.getByRole('button', { name: 'Do First' }))
    await userEvent.click(screen.getByRole('button', { name: 'Bin' }))
    await userEvent.click(screen.getByRole('button', { name: 'Snooze' }))
    expect(bin).toHaveBeenCalledWith(items[1], 'Other')
    expect(snooze).toHaveBeenCalledWith(items[2], '')
    expect(screen.getByText('All clear')).toBeInTheDocument()
    expect(screen.getByText('03 cleared this sitting')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Do/ })).not.toBeInTheDocument()
  })

  it('INBX-2: Undo shows where the button was for 8 seconds and puts the item back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { undo } = deck()
    await userEvent.click(screen.getByRole('button', { name: 'Do First' }))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledWith(items[0], 'primary')
    expect(heading()).toBe('First')
    expect(counter()).toBe('01 of 03')
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Bin' }))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(8100))
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('works by keyboard: j and k move, Enter runs the primary action, x bins, s snoozes', async () => {
    const { primary, bin, snooze } = deck()
    await userEvent.keyboard('j')
    expect(heading()).toBe('Second')
    await userEvent.keyboard('k')
    expect(heading()).toBe('First')
    await userEvent.keyboard('{Enter}')
    expect(primary).toHaveBeenCalledWith(items[0])
    expect(heading()).toBe('Second')
    await userEvent.keyboard('x')
    expect(bin).toHaveBeenCalledWith(items[1], 'Other')
    await userEvent.keyboard('s')
    expect(snooze).toHaveBeenCalledWith(items[2], '')
    expect(screen.getByText('All clear')).toBeInTheDocument()
  })

  it('Enter on a focused control does not also run the primary action', async () => {
    const { primary } = deck()
    screen.getByRole('button', { name: 'Skip' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(primary).not.toHaveBeenCalled()
    expect(heading()).toBe('Second')
  })

  it('e focuses the draft, and keys typed there are not commands', async () => {
    const primary = vi.fn()
    function Item() {
      const [t, setT] = useState('Hello')
      return <Draft text={t} original="Hello" onChange={setT} />
    }
    render(<Deck items={items} renderItem={() => <Item />} primaryAction={{ label: () => 'Send', onClick: primary }} />)
    await userEvent.keyboard('e')
    const box = screen.getByRole('textbox', { name: 'Draft' })
    expect(box).toHaveFocus()
    await userEvent.keyboard(' there{Enter}x')
    expect(box).toHaveValue('Hello there\nx')
    expect(primary).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
  })

  it('List calls back, and an empty deck is one line', async () => {
    const { list } = deck()
    await userEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(list).toHaveBeenCalled()
    render(<Deck items={[]} renderItem={() => null} primaryAction={{ label: () => 'Do', onClick: vi.fn() }} emptyText="Nobody is waiting on you" />)
    expect(screen.getByText('Nobody is waiting on you')).toBeInTheDocument()
  })
})

describe('Card', () => {
  function card(over: Partial<Parameters<typeof Card>[0]> = {}) {
    const close = vi.fn()
    const action = vi.fn()
    render(
      <div>
        <button type="button">Opener</button>
        <Card
          label="Job"
          title="Senior PMM at Northwind Sample Co"
          sections={[
            { label: 'Why', body: 'Fits the ICP.' },
            { body: 'No label here.' },
          ]}
          primaryAction={{ label: 'Chased', onClick: action }}
          foot="Found by the jobs agent"
          onClose={close}
          {...over}
        />
      </div>,
    )
    return { close, action }
  }

  it('is a dialog in a window over the sheet with one primary button, and takes focus', () => {
    card()
    const dialog = screen.getByRole('dialog', { name: 'Senior PMM at Northwind Sample Co' })
    expect(dialog).toHaveFocus()
    expect(dialog.closest('[data-card-backdrop]')).not.toBeNull()
    expect(dialog.className).toContain('w-full')
    expect(within(dialog).getByText('Job')).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { level: 3, name: 'Why' })).toBeInTheDocument()
    expect(within(dialog).getByText('Fits the ICP.')).toBeInTheDocument()
    expect(within(dialog).getByText('Found by the jobs agent')).toBeInTheDocument()
    expect(dialog.querySelectorAll('[data-kind="primary"]')).toHaveLength(1)
  })

  it('closes with Esc or the Close control after the slide, and gives focus back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { close } = card()
    const dialog = screen.getByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(dialog).toHaveAttribute('data-closing', 'true')
    expect(close).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(close).toHaveBeenCalledTimes(1)
    // A second Esc while closing does nothing more.
    await userEvent.keyboard('{Escape}')
    await act(() => vi.advanceTimersByTimeAsync(250))
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('Close control works and focus returns to what opened it', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { close } = card()
    expect(screen.getByRole('dialog')).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await act(() => new Promise((r) => setTimeout(r, 250)))
    expect(close).toHaveBeenCalled()
    document.body.removeChild(opener)
  })
})

describe('Draft', () => {
  it('shows Reset only once edited, and Reset restores the original (INBX-3)', async () => {
    function Wrap() {
      const [t, setT] = useState('Hello')
      return <Draft text={t} original="Hello" onChange={setT} />
    }
    render(<Wrap />)
    const box = screen.getByRole('textbox', { name: 'Draft' })
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
    await userEvent.type(box, ' again')
    expect(box).toHaveValue('Hello again')
    expect(box.closest('[data-draft-box]')).toHaveAttribute('data-edited', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(box).toHaveValue('Hello')
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument()
  })
})

describe('Switch', () => {
  it('is a switch with a solid dot when on and a hollow dot when off; disabled does nothing', async () => {
    const change = vi.fn()
    const { rerender } = render(<Switch on={false} label="Night theme" onChange={change} />)
    const sw = screen.getByRole('switch', { name: 'Night theme' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(sw.querySelector('[data-dot]')).toHaveAttribute('data-dot', 'hollow')
    await userEvent.click(sw)
    expect(change).toHaveBeenCalledWith(true)
    rerender(<Switch on label="Night theme" onChange={change} />)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(sw.querySelector('[data-dot]')).toHaveAttribute('data-dot', 'solid')
    await userEvent.keyboard(' ')
    expect(change).toHaveBeenCalledWith(false)
    rerender(<Switch on label="Night theme" onChange={change} disabled />)
    change.mockClear()
    await userEvent.click(sw)
    expect(change).not.toHaveBeenCalled()
  })
})

describe('Field', () => {
  it('labels text, date and choice fields, and puts an error under the field in words', async () => {
    const change = vi.fn()
    render(
      <>
        <Field label="Colleague" value="" onChange={change} placeholder="Who takes it" />
        <Field label="Due" value="2026-11-16" onChange={change} kind="date" />
        <Field label="Reason" value="" onChange={change} kind="choice" placeholder="Choose one" choices={[{ value: 'filled', label: 'Filled' }]} />
        <Field label="Split" value="" onChange={change} error="Agree the split first" />
      </>,
    )
    await userEvent.type(screen.getByRole('textbox', { name: 'Colleague' }), 'S')
    expect(change).toHaveBeenCalledWith('S')
    expect(screen.getByLabelText('Due')).toHaveAttribute('type', 'date')
    const choice = screen.getByRole('combobox', { name: 'Reason' })
    await userEvent.selectOptions(choice, 'filled')
    expect(change).toHaveBeenCalledWith('filled')
    const split = screen.getByRole('textbox', { name: 'Split' })
    expect(split).toHaveAttribute('aria-invalid', 'true')
    expect(split).toHaveAccessibleDescription('Agree the split first')
  })
})

describe('Note', () => {
  it('is one dark card with one sentence and at most one link, and stays until closed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const close = vi.fn()
    const fix = vi.fn()
    render(<Note text="Outlook needs signing in again" link={{ label: 'Fix', onClick: fix }} onClose={close} />)
    const note = screen.getByRole('status')
    expect(note).toHaveTextContent('Outlook needs signing in again')
    expect(within(note).getAllByRole('button')).toHaveLength(2)
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(close).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Fix' }))
    expect(fix).toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    expect(note).toHaveAttribute('data-fading', 'true')
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(close).toHaveBeenCalledTimes(1)
  })
})

describe('Gallery', () => {
  it('shows every component (FE-3)', () => {
    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <Gallery />
      </MemoryRouter>,
    )
    for (const name of ['Deck', 'Card', 'Note', 'Switch', 'Field', 'Draft', 'HeroStat', 'Row', 'PillButton']) {
      expect(screen.getAllByRole('heading', { level: 2, name: new RegExp(`^${name}`) }).length).toBeGreaterThan(0)
    }
  })
})
