import { contextBridge, ipcRenderer } from 'electron';
import type { AgentBridge } from '../shared/contracts';

const bridge: AgentBridge = {
  preview: false,
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  createTask: input => ipcRenderer.invoke('tasks:create', input),
  cancelTask: id => ipcRenderer.invoke('tasks:cancel', id),
  decide: input => ipcRenderer.invoke('tasks:decide', input),
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  provider: () => ipcRenderer.invoke('provider:view'),
  saveProvider: input => ipcRenderer.invoke('provider:save', input),
  testProvider: () => ipcRenderer.invoke('provider:test'),
  openArtifact: input => ipcRenderer.invoke('artifact:open', input),
  onChange: callback => {
    const listener = () => callback();
    ipcRenderer.on('tasks:changed', listener);
    return () => ipcRenderer.removeListener('tasks:changed', listener);
  }
};
contextBridge.exposeInMainWorld('agent47', bridge);
