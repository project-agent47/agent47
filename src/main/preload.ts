import { contextBridge, ipcRenderer } from 'electron';
import type { AgentBridge } from '../shared/contracts';

const bridge: AgentBridge = {
  preview: false,
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  createTask: input => ipcRenderer.invoke('tasks:create', input),
  cancelTask: id => ipcRenderer.invoke('tasks:cancel', id),
  sendMessage: input => ipcRenderer.invoke('tasks:send', input),
  resolveUnknown: id => ipcRenderer.invoke('tasks:resolve', id),
  decide: input => ipcRenderer.invoke('tasks:decide', input),
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  provider: () => ipcRenderer.invoke('provider:view'),
  saveProvider: input => ipcRenderer.invoke('provider:save', input),
  testProvider: () => ipcRenderer.invoke('provider:test'),
  openArtifact: input => ipcRenderer.invoke('artifact:open', input),
  listSkills: () => ipcRenderer.invoke('skills:list'),
  previewSkill: () => ipcRenderer.invoke('skills:preview'),
  installSkill: ticket => ipcRenderer.invoke('skills:install', ticket),
  setSkill: input => ipcRenderer.invoke('skills:set', input),
  executionSettings: () => ipcRenderer.invoke('execution:view'),
  setExecutionSettings: input => ipcRenderer.invoke('execution:set', input),
  setTaskPermissions: input => ipcRenderer.invoke('tasks:permissions', input),
  restoreFile: input => ipcRenderer.invoke('tasks:restore', input),
  undoRun: id => ipcRenderer.invoke('tasks:undo', id),
  snapshotSettings: () => ipcRenderer.invoke('snapshots:view'),
  setSnapshotRetention: days => ipcRenderer.invoke('snapshots:retention', days),
  cleanSnapshots: () => ipcRenderer.invoke('snapshots:clean'),
  onChange: callback => {
    const listener = () => callback();
    ipcRenderer.on('tasks:changed', listener);
    return () => ipcRenderer.removeListener('tasks:changed', listener);
  }
};
contextBridge.exposeInMainWorld('agent47', bridge);
