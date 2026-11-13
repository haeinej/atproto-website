import { Refused } from '../service/src/store.mjs';

export function notBuilt() {
  throw new Refused(501, 'NotBuiltYet', 'This cortex request is not built yet');
}

const request = (verb, asks, takes, gives) => ({ verb, asks, changes: verb === 'POST', about: 'This cortex request is not built yet.', takes, gives, run: notBuilt });
const capability = (name, requests) => ({ name, about: `Private cortex ${name.toLowerCase()}. Not built yet.`, requests: Object.fromEntries(Object.entries(requests).map(([name, value]) => [`com.ohmmmm.cortex.${name}`, value])) });

// Reserved requests stay authenticated while their implementations are unavailable.
export const pendingCapabilities = [
  capability('Notes', {
    addNote: request('POST', 'member', { id: 'a client-made ID', note: 'one line, at most 500 characters', session: 'the session', project: 'optional: repository' }, '`id`'),
    listNotes: request('GET', 'member', { settled: 'optional: include settled notes' }, '`notes`'),
    settleNotes: request('POST', 'member', { notes: 'each note ID and its outcome' }, '`settled`'),
  }),
  capability('Turns', {
    addTurns: request('POST', 'member', { turns: 'up to 50 client-identified turns' }, '`kept`'),
    listTurns: request('GET', 'member', { limit: 'optional: 40 unless said' }, '`turns`, `waiting`'),
    settleTurns: request('POST', 'member', { turns: 'each turn ID and its outcome' }, '`settled`'),
  }),
  capability('Skills', {
    listSkills: request('GET', 'member', {}, '`skills`'),
    getSkill: request('GET', 'member', { name: 'the skill name' }, '`skill`, `version`'),
    putSkill: request('POST', 'member', { skill: 'SKILL.md and supporting files', replaces: 'optional: previous version' }, '`name`, `version`, `approved`'),
    approveSkill: request('POST', 'ohm', { name: 'the skill name', version: 'exactly the version approved' }, '`name`, `approved`'),
    deleteSkill: request('POST', 'member', { name: 'the skill name', replaces: 'current version' }, '`name`, `removed`'),
  }),
  capability('Tools', {
    listTools: request('GET', 'member', {}, '`tools`'),
    putTool: request('POST', 'ohm', { tool: 'the tool', replaces: 'optional: previous version' }, '`name`, `version`'),
    deleteTool: request('POST', 'ohm', { name: 'the tool name', replaces: 'current version' }, '`name`, `removed`'),
    proposeTool: request('POST', 'member', { tool: 'name, description, inputs and outputs' }, '`name`, `proposed`'),
  }),
  capability('Cortex Export', {
    exportFiles: request('GET', 'member', {}, '`files` (path, text)'),
  }),
];
