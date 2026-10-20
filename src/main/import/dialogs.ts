import { BrowserWindow, dialog } from 'electron'
import type { Dialogs } from '../ipc/handlers'

const parent = (): BrowserWindow | undefined => BrowserWindow.getFocusedWindow() ?? undefined

export const importDialogs: Dialogs = {
  async pickMusic() {
    const options: Electron.OpenDialogOptions = {
      title: 'Add Music',
      buttonLabel: 'Add',
      properties: ['openFile', 'openDirectory', 'multiSelections']
    }
    const window = parent()
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  },
  async pickPdf() {
    // End-to-end tests can't drive a native dialog: they name the file in the environment.
    if (process.env['FDP_PICK_ATTACHMENT']) return process.env['FDP_PICK_ATTACHMENT']
    const options: Electron.OpenDialogOptions = {
      title: 'Attach a PDF',
      buttonLabel: 'Attach',
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const window = parent()
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  },
  async pickAppleLibrary() {
    const options: Electron.OpenDialogOptions = {
      title: 'Choose your Apple Music Library.xml',
      buttonLabel: 'Choose',
      properties: ['openFile'],
      filters: [{ name: 'Apple Music Library', extensions: ['xml'] }]
    }
    const window = parent()
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  }
}
