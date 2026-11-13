import type { QueryStream } from '../../../native/index.js'
import { errorText } from '../../../ui/format.js'
import type { ComposerSnapshot } from '../composer/snapshot.js'
import { clearEditor, getEditorText, insertText, type EditorState } from '../../input/editor.js'
import type { OverlayState } from '../selector/overlay-state.js'
import { createQueueSelectorState, type ManagedQueuedPrompt } from './queue-manage.js'
import { PendingQueue, type PendingEntry, type QueueTarget } from './pending-queue.js'

export interface QueueEditing {
  entry: ManagedQueuedPrompt
  stash: ComposerSnapshot
  consumed: boolean
}
export interface QueueEditDeps {
  queue: PendingQueue
  getTarget: () => QueueTarget
  getStream: () => QueryStream | null
  getEditor: () => EditorState
  setEditor: (editor: EditorState) => void
  getOverlay: () => OverlayState
  setOverlay: (overlay: OverlayState) => void
  getEditing: () => QueueEditing | null
  setEditing: (edit: QueueEditing | null) => void
  snapshot: () => ComposerSnapshot
  restore: (snapshot: ComposerSnapshot, recovery?: boolean) => void
  clearAll: () => void
  preparing: () => boolean
  busy: () => boolean
  getDispatch: () => string | null
  setDispatch: (id: string | null) => void
  runQueued: (entry: PendingEntry) => Promise<void>
  commitSystem: (id: string, text: string, kind?: 'error') => void
  commitUser: (text: string) => void
  requestRender: () => void
}

/** Queue presentation and lifecycle share logical IDs; native handles are only
 * used for entries that still belong to a running engine. */
export function createQueueEdit(deps: QueueEditDeps) {
  const queue = deps.queue
  const notify = (message: string) => { deps.commitSystem('sys-queue', `  ${message}`); deps.requestRender() }
  const entries = () => queue.visible(deps.getTarget())
  const editingEntry = () => deps.getEditing()?.entry ?? null
  const managed = (entry: PendingEntry): ManagedQueuedPrompt => ({
    id: entry.id, version: entry.version, queue: entry.queue,
    text: `${entry.paused ? '[paused] ' : entry.queue === 'follow_up' ? '[next] ' : '[steer] '}${entry.text}`,
  })
  const find = (entry: ManagedQueuedPrompt) => queue.state.entries.find(candidate => candidate.id === entry.id && candidate.target === deps.getTarget())

  function openQueueSelector() {
    if (deps.getEditing()) { notify('Finish or discard the queued prompt edit first.'); return }
    if (queue.state.blocked) {
      for (const stream of new Set(queue.state.entries.flatMap(entry => entry.native ? [entry.native.stream] : []))) detach(stream)
    }
    const visible = entries()
    if (!visible.length) { deps.setOverlay({ kind: 'none' }); notify('No queued prompts.'); return }
    deps.setOverlay({ kind: 'selector', state: createQueueSelectorState(visible.map(managed), visible.some(entry => entry.paused)) })
    deps.requestRender()
  }

  function finishQueueEdit() {
    const edit = deps.getEditing()
    if (!edit) return
    deps.setEditing(null)
    deps.restore(edit.stash)
  }
  function cancelQueueEdit() { finishQueueEdit(); notify('Queue edit discarded.') }
  function editQueuedPrompt(item: ManagedQueuedPrompt) {
    const entry = find(item)
    if (!entry) { notify('Queued prompt is no longer pending.'); return }
    if (deps.preparing() || deps.getEditing()) { notify('Finish or discard the pending input first.'); return }
    if (entry.contentJson) { notify('Structured prompts cannot be edited here. Use Shift+↑ to recover pending prompts newest first.'); return }
    deps.setEditing({ entry: item, stash: deps.snapshot(), consumed: false })
    deps.clearAll()
    deps.setEditor(insertText(clearEditor(deps.getEditor()), entry.expandedText))
    deps.setOverlay({ kind: 'none' })
    notify('Editing queued prompt · Enter save · Esc discard')
  }
  function saveQueueEdit(text: string) {
    const edit = deps.getEditing()
    if (!edit || !text.trim()) return
    if (edit.consumed) { notify('Original prompt was sent; copy your changes or press Esc to discard this edit.'); return }
    const entry = find(edit.entry)
    if (!entry) { edit.consumed = true; notify('Original prompt was sent; edit retained. Esc discards.'); return }
    try {
      queue.update(entry, edit.entry.version, text)
      finishQueueEdit()
      notify('Queued prompt updated.')
    } catch (err) {
      notify(`Queue edit failed: ${errorText(err)}`)
      reconcileQueuedUserMessages()
      if (find(edit.entry)) edit.entry = managed(entry)
    }
  }
  function removeQueuedPrompt(item: ManagedQueuedPrompt) {
    const entry = find(item)
    if (!entry) { notify('Queued prompt is no longer pending.'); return }
    try { queue.remove(entry, item.version); openQueueSelector() }
    catch (err) { reconcileQueuedUserMessages(); notify(`Queue remove failed: ${errorText(err)}`) }
    deps.requestRender()
  }
  function restoreLastQueuedUserMessageToEditor() {
    if (getEditorText(deps.getEditor()).length || deps.getEditing() || deps.preparing()) {
      notify('Finish or clear the draft before dequeueing.'); return
    }
    const entry = entries().at(-1)
    if (!entry) { notify('No queued prompts.'); return }
    try {
      queue.remove(entry, entry.version)
      deps.restore(entry.snapshot, true)
    } catch (err) { reconcileQueuedUserMessages(); notify(`Dequeue failed: ${errorText(err)}`) }
    deps.requestRender()
  }
  function commitConsumed(consumed: PendingEntry[]) {
    for (const entry of consumed) deps.commitUser(entry.text)
    const edit = deps.getEditing()
    if (edit && consumed.some(entry => entry.id === edit.entry.id)) {
      edit.consumed = true
      notify('Original prompt was sent; unsaved edit retained. Esc discards.')
    }
    deps.requestRender()
  }
  function reconcileQueuedUserMessages() {
    const stream = deps.getStream()
    if (!stream) return
    try { commitConsumed(queue.reconcile(stream)) }
    catch (err) { notify(`Queue read failed: ${errorText(err)}`) }
  }
  function detach(stream: QueryStream): boolean {
    try {
      queue.detach(stream, commitConsumed)
      return true
    } catch (err) {
      notify(`Queue ownership unresolved: ${errorText(err)}. Ctrl+G to retry.`)
      return false
    }
  }
  function pause(stream = deps.getStream()) {
    deps.setDispatch(null)
    queue.state.reservation = null
    if (stream) detach(stream)
    queue.settle(queue.state.chain, false)
    deps.requestRender()
  }
  function begin(target: QueueTarget): number {
    if (deps.getDispatch()) { queue.state.running = true; return queue.state.chain }
    return queue.begin(target)
  }
  function started(stream: QueryStream, sessionId?: string) {
    if (sessionId) queue.bindSession(sessionId)
    const id = deps.getDispatch()
    const initial = queue.state.entries.find(entry => entry.id === id)
    if (initial) {
      queue.remove(initial, initial.version)
      commitConsumed([initial])
    }
    queue.attach(stream)
    deps.requestRender()
  }
  function settled(stream: QueryStream | null, chain: number, success: boolean) {
    if (chain !== queue.state.chain) return
    const detached = !stream || detach(stream)
    queue.settle(chain, success && detached)
    deps.requestRender()
  }
  function dispatchNext() {
    if (deps.busy() || deps.getDispatch() || queue.state.blocked) return
    const entry = queue.next(queue.state.chain)
    if (!entry || entry.target !== deps.getTarget()) return
    deps.setDispatch(entry.id)
    void deps.runQueued(entry).catch(err => {
      if (deps.getDispatch() === entry.id) { pause(); notify(`Queued run failed: ${errorText(err)}`) }
    }).finally(() => {
      if (deps.getDispatch() !== entry.id) return
      if (queue.state.entries.includes(entry)) {
        queue.settle(entry.chain, false)
        notify('Queued run did not start; pending work paused.')
      }
      deps.setDispatch(null)
      dispatchNext()
    })
  }
  function resumePaused() {
    if (deps.busy() || deps.getDispatch() || deps.preparing() || deps.getEditing()) { notify('Wait for the current operation before resuming.'); return }
    if (queue.state.blocked) {
      for (const stream of new Set(queue.state.entries.flatMap(entry => entry.native ? [entry.native.stream] : []))) {
        if (!detach(stream)) return
      }
    }
    deps.setOverlay({ kind: 'none' })
    queue.resume(deps.getTarget())
    dispatchNext()
  }
  return {
    editingEntry, openQueueSelector, editQueuedPrompt, cancelQueueEdit, saveQueueEdit, removeQueuedPrompt,
    restoreLastQueuedUserMessageToEditor, reconcileQueuedUserMessages, begin, started, settled, dispatchNext,
    resumePaused, pause, entries, refresh: deps.requestRender,
  }
}
