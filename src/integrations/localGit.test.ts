import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

import { repositoryActivity } from './localGit'

const PATH = 'C:\\code\\api'

describe('asking the desktop side for new commits', () => {
  beforeEach(() => invoke.mockReset())

  it.each([
    ['nothing is remembered', undefined, { count: 1, latest: 5 }, { path: PATH, since: 4 }],
    ['an empty list is remembered', [], { count: 1, latest: 5 }, { path: PATH, since: 4 }],
    ['commits were counted ahead of their dates', [9], { count: 0, latest: 4, ahead: [9], passed: 1 }, { path: PATH, since: 4, ahead: [9] }],
  ])('asks, and hands back the answer, when %s', async (_, ahead, answer, args) => {
    invoke.mockResolvedValue(answer)
    await expect(repositoryActivity(PATH, 4, ahead)).resolves.toEqual(answer)
    expect(invoke).toHaveBeenCalledWith('repository_activity', args)
  })
})
