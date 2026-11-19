// @vitest-environment jsdom
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { searchWikiFiles } from '../src/main/store/wiki-search'
import { findWikiMatches } from '../src/renderer/components/WikiSearch'
import { useWikis, WikisProvider } from '../src/renderer/context/WikisContext'

it('finds current Markdown matches across inline formatting and escapes literal queries', () => {
  const body = document.createElement('div')
  body.innerHTML = '<h1>更新标题</h1><p>今天<strong>读书</strong>很久。</p><p>C++ 与 c++</p><p>今天</p><p>读书</p>'
  expect(findWikiMatches(body, '今天读书').map(match => match.toString())).toEqual(['今天读书'])
  expect(findWikiMatches(body, 'C++').map(match => match.toString())).toEqual(['C++', 'c++'])
  expect(findWikiMatches(body, '   ')).toEqual([])
})

it('searches open and sealed Wikis while leaving backup revisions out of results', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'flownote-wiki-search-'))
  try {
    await mkdir(join(dir, 'wikis', 'sealed'), { recursive: true })
    await mkdir(join(dir, 'wikis', 'backups'))
    await writeFile(join(dir, 'wikis', '读书_2026_11.md'), '# 题目\n\n今天**读书**很久。')
    await writeFile(join(dir, 'wikis', 'sealed', '读书_2026_09_sealed_old.md'), '以前也在今天读书。')
    await writeFile(join(dir, 'wikis', 'backups', '读书_2026_11.md'), '今天读书')
    await expect(searchWikiFiles(dir, ' 今天读书 ')).resolves.toEqual({ total: 2, skipped: 0, hits: [
      { filename: '读书_2026_11.md', sealed: false, excerpt: '今天读书很久。' },
      { filename: '读书_2026_09_sealed_old.md', sealed: true, excerpt: '以前也在今天读书。' }
    ] })
    await expect(searchWikiFiles(dir, '其他')).resolves.toEqual({ total: 0, skipped: 0, hits: [] })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

it('keeps the last selected Wiki when an earlier response arrives late', async () => {
  let finishFirst!: (value: string) => void
  const first = new Promise<string>(resolve => { finishFirst = resolve })
  vi.stubGlobal('api', {
    on: () => () => {},
    wikis: { list: async () => [], listSealed: async () => [], load: () => first, loadSealed: async () => '已封存的正文' }
  })
  const { result, unmount } = renderHook(useWikis, {
    wrapper: ({ children }: { children: ReactNode }) => createElement(WikisProvider, { children })
  })
  try {
    await act(async () => { void result.current.selectFile('earlier.md') })
    expect(result.current.isLoading).toBe(true)
    await act(async () => { await result.current.selectSealed('latest.md') })
    await act(async () => { finishFirst('过时的正文') })
    expect(result.current).toMatchObject({ currentFile: 'latest.md', currentIsSealed: true, currentContent: '已封存的正文', isLoading: false })
  } finally {
    unmount()
    vi.unstubAllGlobals()
  }
})
