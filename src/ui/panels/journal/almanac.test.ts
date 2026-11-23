import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ALL_OFF, withFeatures } from '../../../game/testing'
import { AlmanacTab } from './AlmanacTab'

// The almanac's pages follow the switches as they are when it opens, not when the module was first imported.
const render = () => renderToStaticMarkup(createElement(AlmanacTab))

it('has the pages of the features switched on when it opens, and draws nothing (without failing) with none on', () => {
  withFeatures({ ...ALL_OFF, visitors: true, fishing: true }, () => {
    const html = render()
    expect(html).toContain('data-testid="tab-visitors"')
    expect(html).toContain('data-testid="tab-fish"')
    expect(html).not.toContain('data-testid="tab-crops"')
  })
  withFeatures(ALL_OFF, () => expect(render()).toBe(''))
})
