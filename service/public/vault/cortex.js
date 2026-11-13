// The cortex beside the vault. The shell owns auth, routing and mounting; this module
// only calls full request names through its authenticated transport, after open().
const request = name => `com.ohmmmm.cortex.${name}`;
const kinds = ['person', 'preference', 'project', 'reference'];
const newest = (a, b) => String(b.when ?? '').localeCompare(String(a.when ?? '')) || String(a.name ?? a.id).localeCompare(String(b.name ?? b.id));
const time = value => value ? new Date(value).toLocaleString() : 'Time not recorded';
const outcome = note => !note.settledAt ? 'Waiting to be settled' : ({ kept: 'Kept for another session', dropped: 'Dropped' }[note.outcome] ?? `Memory: ${note.outcome}`);
function node(tag, className = '', text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function button(text, press, className = 'button secondary sm') {
  const element = node('button', className, text);
  element.type = 'button';
  element.addEventListener('click', press);
  return element;
}
function facts(parent, entries) {
  const list = node('dl', 'cortex-facts');
  for (const [name, value] of entries) {
    if (value === undefined || value === null || value === '') continue;
    list.append(node('dt', '', name), node('dd', '', String(value)));
  }
  parent.append(list);
}

export function createCortexPanel({ call, notice, changed, canApprove }) {
  const directory = node('div', 'directory-scroll cortex-directory');
  const screen = node('section', 'screen cortex-screen');
  for (const element of [directory, screen]) {
    element.dataset.page = 'cortex';
    element.hidden = true;
  }
  const choices = node('div', 'pills');
  choices.setAttribute('aria-label', 'Cortex view');
  const refresh = button('Refresh', () => open());
  const status = node('p', 'small cortex-status');
  status.setAttribute('role', 'status');
  const items = node('ul', 'cortex-list');
  const directoryTop = node('div', 'cortex-directory-top');
  directoryTop.append(choices, refresh);
  directory.append(directoryTop, status, items);
  screen.setAttribute('aria-label', 'Cortex detail');

  let active = false, generation = 0, listing = 0, reading = 0;
  let tab = 'memories', current = null, editing = null, busy = false;
  let memories = new Map(), notes = new Map(), skills = new Map();
  let states = {};
  const live = ticket => active && ticket === generation;
  const dirty = () => editing && JSON.stringify(editing.memory) !== editing.original;
  const selected = (type, key) => current?.type === type && current.key === key;
  const collection = type => ({ memories, notes, skills })[type];

  // Synchronous for the shell's route guard. A write cannot be left midway;
  // declining a discard leaves both the exact base version and typed content intact.
  function canLeave() {
    if (busy) { notice('Wait for this change to finish.'); return false; }
    if (dirty() && !globalThis.confirm('Discard your unsaved memory changes?')) return false;
    if (editing) { editing = null; renderDetail(); }
    return true;
  }
  function clearDetail() {
    reading++;
    current = null;
    editing = null;
    renderDetail();
    renderDirectory();
    changed();
  }
  function switchTab(next) {
    if (next === tab || !canLeave()) return;
    tab = next;
    clearDetail();
  }
  function renderDirectory() {
    choices.replaceChildren(...Object.entries({ memories: 'Memories', notes: 'Notes', skills: 'Skills' }).map(([key, label]) => {
      const choice = button(label, () => switchTab(key), 'pill');
      choice.setAttribute('aria-pressed', String(tab === key));
      return choice;
    }));
    const state = states[tab];
    const all = [...collection(tab).values()].sort(tab === 'skills' ? (a, b) => a.name.localeCompare(b.name) : newest);
    status.textContent = state?.loading ? 'Reading your cortex…' : state?.error
      ? `Couldn’t refresh ${tab}. ${all.length ? 'Previously loaded items are shown. ' : ''}Use Refresh to try again.`
      : state?.loaded ? `${all.length} ${tab}${tab === 'memories' ? ' · newest first' : ''}` : 'Open the cortex to read it.';
    items.replaceChildren(...all.map(item => {
      const key = item.name ?? item.id;
      const row = button('', () => select(tab, key), 'cortex-item');
      row.setAttribute('aria-current', String(selected(tab, key)));
      row.append(node('span', 'cortex-item-title', tab === 'notes' ? item.text : item.name));
      if (item.description) row.append(node('span', 'small', item.description));
      row.append(node('span', 'small', [item.writtenBy || 'Author not recorded', item.when && time(item.when), tab === 'notes' && outcome(item), tab === 'skills' && (item.approved ? 'Approved' : 'Awaiting approval')].filter(Boolean).join(' · ')));
      const li = node('li');
      li.append(row);
      return li;
    }));
    if (state?.loaded && !all.length) items.append(node('li', 'small cortex-status', `No ${tab} yet.`));
  }

  // listMemories is a change feed: keep following more/cursor and apply removals.
  // Only replace the visible index after a complete read, never after a partial page.
  async function readMemories(ticket, serial) {
    const found = new Map(), cursors = new Set();
    let since;
    while (live(ticket) && serial === listing) {
      const page = await call(request('listMemories'), since === undefined ? {} : { query: { since } });
      if (!live(ticket) || serial !== listing) return;
      for (const item of page.memories) {
        if (item.removed) found.delete(item.name); else found.set(item.name, item);
      }
      if (!page.more) return found;
      if (page.cursor === undefined || cursors.has(page.cursor)) throw new Error('The memory cursor did not advance');
      cursors.add(page.cursor);
      since = page.cursor;
    }
  }
  async function open() {
    if (busy) return;
    active = true;
    const ticket = generation, serial = ++listing;
    // Opening again supersedes pending detail/history reads as well as list reads.
    reading++;
    for (const key of ['memories', 'notes', 'skills']) states[key] = { ...states[key], loading: true, error: false };
    renderDirectory();
    await Promise.all(['memories', 'notes', 'skills'].map(async key => {
      try {
        const found = key === 'memories' ? await readMemories(ticket, serial)
          : new Map((await call(request(key === 'notes' ? 'listNotes' : 'listSkills'), key === 'notes' ? { query: { settled: '1' } } : {}))[key].map(item => [item.name ?? item.id, item]));
        if (!live(ticket) || serial !== listing) return;
        if (key === 'memories') memories = found;
        if (key === 'notes') notes = found;
        if (key === 'skills') skills = found;
        states[key] = { loaded: true };
      } catch (problem) {
        if (!live(ticket) || serial !== listing) return;
        states[key] = { ...states[key], loading: false, error: true };
        notice(`Reading ${key} did not work: ${problem.message}`, 'error');
      }
      renderDirectory();
    }));
    if (!live(ticket) || serial !== listing) return;
    // A refresh may update the index, but never replaces a draft, even a clean one.
    if (current && !editing && !busy) {
      if (states[current.type]?.error) return;
      if (!collection(current.type).has(current.key)) clearDetail();
      else await select(current.type, current.key, true);
    }
  }
  function reset() {
    active = false;
    generation++; listing++; reading++;
    busy = false;
    tab = 'memories'; current = null; editing = null;
    memories = new Map(); notes = new Map(); skills = new Map(); states = {};
    screen.removeAttribute('aria-busy');
    renderDirectory(); renderDetail();
    changed();
  }
  async function select(type, key, reload = false) {
    if (!active || busy || (!reload && !canLeave())) return;
    tab = type;
    const ticket = generation, serial = ++reading;
    const before = reload ? current : null;
    current = { type, key, loading: true };
    renderDirectory(); renderDetail(); changed();
    try {
      let detail;
      if (type === 'memories') detail = await call(request('getMemory'), { query: { name: key, history: '1' } });
      if (type === 'skills') {
        // Approval is from listSkills, never inferred from getSkill or from its text.
        const [read, index] = await Promise.all([
          call(request('getSkill'), { query: { name: key } }), call(request('listSkills'), {}),
        ]);
        detail = { ...read, index: index.skills.find(item => item.name === key) };
      }
      if (type === 'notes') detail = { note: notes.get(key) };
      if (!live(ticket) || serial !== reading) return;
      current = { type, key, ...detail };
      renderDetail(); renderDirectory();
    } catch (problem) {
      if (!live(ticket) || serial !== reading) return;
      // A previously approved snapshot must not survive a refused current read.
      const unavailableSkill = type === 'skills' && (problem.code === 'SkillNotApproved' || problem.status === 404);
      current = unavailableSkill ? { type, key } : before ?? { type, key };
      current.error = problem.code === 'SkillNotApproved' ? 'Sign in to ohm with a linked account to read and approve this skill.' : `Opening this item did not work: ${problem.message}`;
      renderDetail();
      notice(current.error, 'error');
    }
  }
  function header(title) {
    const head = node('header', 'screen-header');
    head.append(button('Back', () => { if (canLeave()) clearDetail(); }, 'button sm mobile-only'), node('h2', 'screen-title', title));
    screen.append(head);
    const scroll = node('div', 'screen-scroll');
    const content = node('div', 'measure cortex-content');
    scroll.append(content); screen.append(scroll);
    return content;
  }
  function problemText(content) {
    const message = node('p', 'cortex-problem', current.error ?? '');
    message.setAttribute('role', 'alert');
    content.append(message);
  }
  function renderDetail() {
    screen.replaceChildren();
    if (!current) {
      const empty = node('div', 'empty');
      empty.append(node('p', '', 'Your cortex'), node('p', 'small', 'Choose a memory, note or skill. Only you can see it.'));
      screen.append(empty);
      return;
    }
    const content = header(current.type === 'notes' ? 'Note' : current.key);
    problemText(content);
    if (current.loading) { content.append(node('p', 'small', 'Reading…')); return; }
    if (current.type === 'memories' && current.memory) renderMemory(content);
    if (current.type === 'notes' && current.note) renderNote(content, current.note);
    if (current.type === 'skills' && current.skill) renderSkill(content);
  }
  function memoryFacts(content, memory, version, author = memory.writtenBy) {
    facts(content, [
      ['Written by', author || 'Author not recorded'], ['Version', version], ['Kind', memory.kind],
      ['Learned from', memory.stated ? 'Stated by you' : 'Inferred by an agent'],
      ['Always in context', memory.always ? 'Yes' : 'No'], ['Source', memory.from], ['Project', memory.project],
      ['Seen in sessions', memory.seen?.count], ['Last seen', memory.seen?.last && time(memory.seen.last)],
    ]);
    if (memory.notes?.length) {
      const list = node('ul', 'cortex-sources');
      for (const id of memory.notes) {
        const note = notes.get(id);
        list.append(node('li', '', note ? `${id}: ${note.text} · ${outcome(note)}` : id));
      }
      content.append(node('h3', '', 'Source notes'), list);
    }
  }
  function renderMemory(content) {
    if (editing) { renderEditor(content); return; }
    const { memory, version, earlier = [], past } = current;
    content.append(node('p', 'cortex-description', memory.description));
    memoryFacts(content, memory, version, current.justSaved ? 'You' : memory.writtenBy);
    content.append(node('pre', 'cortex-text', memory.body));
    const actions = node('div', 'row');
    actions.append(button('Edit memory', () => {
      if (!active || busy) return;
      editing = { memory: structuredClone(current.memory), version: current.version, original: JSON.stringify(current.memory) };
      current.error = '';
      renderDetail();
    }), button('Remove memory', removeMemory));
    content.append(actions, node('h3', '', 'Replaced versions'));
    if (!earlier.length) content.append(node('p', 'small', 'No earlier versions.'));
    const history = node('ul', 'cortex-history');
    for (const entry of earlier) {
      const li = node('li');
      li.append(button(`Read version ${entry.version}`, () => readEarlier(entry.version)), node('p', 'small', `${entry.writtenBy} · written ${time(entry.when)} · replaced ${time(entry.replacedAt)}`));
      history.append(li);
    }
    content.append(history);
    if (current.historyLoading) content.append(node('p', 'small', 'Reading the earlier version…'));
    if (past) {
      const preview = node('section', 'cortex-past');
      preview.append(node('h3', '', 'Earlier memory'), node('p', '', past.memory.description));
      memoryFacts(preview, past.memory, past.version);
      preview.append(node('pre', 'cortex-text', past.memory.body), button('Restore this version', restoreMemory));
      content.append(preview);
    }
  }
  function renderEditor(content) {
    const draft = editing;
    const form = node('form', 'cortex-editor');
    form.setAttribute('aria-label', 'Edit memory');
    const field = (name, title, tag = 'input') => {
      const label = node('label', 'field-label', title);
      const input = node(tag, 'field');
      input.name = name;
      if (tag === 'input') input.type = 'text';
      if (tag === 'select') for (const kind of kinds) {
        const option = node('option', '', kind); option.value = kind; input.append(option);
      }
      input.value = draft.memory[name] ?? '';
      input.addEventListener('input', () => {
        if (name === 'from' || name === 'project') {
          if (input.value) draft.memory[name] = input.value; else delete draft.memory[name];
        } else draft.memory[name] = input.value;
      });
      label.append(input); form.append(label);
      return input;
    };
    field('description', 'Description').required = true;
    field('kind', 'Kind', 'select');
    field('from', 'Source'); field('project', 'Project');
    for (const [key, text] of [['stated', 'I stated this'], ['always', 'Include in every session’s context']]) {
      const label = node('label', 'cortex-check');
      const input = node('input'); input.type = 'checkbox'; input.name = key; input.checked = Boolean(draft.memory[key]);
      input.addEventListener('change', () => { draft.memory[key] = input.checked; });
      label.append(input, node('span', '', text)); form.append(label);
    }
    field('body', 'Memory (Markdown, at most 8 KB)', 'textarea');
    form.append(node('p', 'small cortex-version', `Replacing exactly ${draft.version}. Source notes and service counters are kept.`));
    const actions = node('div', 'row');
    const save = node('button', 'button primary', 'Save memory'); save.type = 'submit';
    actions.append(save, button('Cancel', () => { if (canLeave()) renderDetail(); }));
    form.append(actions);
    form.addEventListener('submit', event => { event.preventDefault(); return saveMemory(); });
    content.append(form);
  }
  async function readEarlier(version) {
    if (!active || busy || editing) return;
    const ticket = generation, serial = ++reading, detail = current;
    detail.historyLoading = true; detail.error = ''; renderDetail();
    try {
      const past = await call(request('getMemory'), { query: { name: detail.key, version } });
      if (!live(ticket) || serial !== reading) return;
      detail.past = past;
    } catch (problem) {
      if (!live(ticket) || serial !== reading) return;
      detail.error = `Reading the earlier version did not work: ${problem.message}`;
      notice(detail.error, 'error');
    }
    if (live(ticket) && serial === reading) { detail.historyLoading = false; renderDetail(); }
  }

  // Retain the form on all refusals, including Changed. Reset invalidates both
  // success and failure handlers, so an old account can never repopulate the panel.
  async function mutate(name, body, apply, message) {
    if (!active || busy) return;
    const ticket = generation;
    busy = true;
    screen.setAttribute('aria-busy', 'true');
    const controls = [...screen.querySelectorAll('button, input, select, textarea')].map(element => [element, element.disabled]);
    for (const [element] of controls) element.disabled = true;
    let success = false;
    try {
      const result = await call(request(name), { body });
      if (!live(ticket)) return;
      apply(result); success = true;
      notice(message);
    } catch (problem) {
      if (!live(ticket)) return;
      const text = problem.code === 'Changed' || problem.code === 'NameTaken'
        ? 'This item changed elsewhere. Your content is still here. If you are editing, copy your changes before cancelling; then Refresh to read the current version.'
        : `The change did not finish: ${problem.message}`;
      current.error = text;
      // Updating the alert alone preserves the actual textarea and its selection.
      screen.querySelector('[role="alert"]').textContent = text;
      notice(text, 'error');
    } finally {
      if (live(ticket)) {
        busy = false; screen.removeAttribute('aria-busy');
        for (const [element, disabled] of controls) element.disabled = disabled;
      }
    }
    if (live(ticket) && success) {
      renderDirectory(); renderDetail(); changed();
      await open();
    }
  }
  async function saveMemory() {
    if (!editing) return;
    const draft = editing, memory = structuredClone(draft.memory), previous = current;
    await mutate('putMemory', { memory, replaces: draft.version }, saved => {
      editing = null;
      current = { type: 'memories', key: memory.name, memory, version: saved.version, justSaved: true,
        earlier: saved.unchanged ? previous.earlier : [{ version: previous.version, writtenBy: previous.memory.writtenBy, when: memories.get(memory.name)?.when, replacedAt: new Date().toISOString() }, ...(previous.earlier ?? [])] };
    }, 'Memory saved.');
  }
  async function removeMemory() {
    if (!active || busy || !current?.memory || !globalThis.confirm(`Remove “${current.key}” from your cortex? It will no longer be in the agent’s Context.`)) return;
    const { key, version } = current;
    await mutate('deleteMemory', { name: key, replaces: version }, () => {
      memories.delete(key); current = null; editing = null; reading++;
    }, 'Memory removed.');
  }
  async function restoreMemory() {
    if (!active || busy || !current?.past || !globalThis.confirm('Restore this earlier memory as a new version? The current version will be kept in history.')) return;
    const { key, version, past } = current;
    await mutate('putMemory', { memory: past.memory, replaces: version }, saved => {
      current = { type: 'memories', key, memory: past.memory, version: saved.version, justSaved: true };
    }, 'Memory restored.');
  }
  function renderNote(content, note) {
    content.append(node('p', 'cortex-description', note.text));
    facts(content, [['Written by', note.writtenBy], ['When', time(note.when)], ['Session', note.session], ['Project', note.project], ['ID', note.id], ['Outcome', outcome(note)], ['Settled at', note.settledAt && time(note.settledAt)]]);
    if (note.settledAt && memories.has(note.outcome)) content.append(button('Read the memory', () => select('memories', note.outcome)));
  }
  function renderSkill(content) {
    const { skill, version, index } = current;
    const matches = index?.version === version;
    content.append(node('p', 'cortex-description', index?.description ?? ''));
    facts(content, [['Written by', index?.writtenBy], ['Version', version], ['Approval', matches ? (index.approved ? 'Approved for this version' : 'Awaiting your approval') : 'Changed while loading. Refresh before approving.']]);
    for (const file of [{ path: 'SKILL.md', text: skill.text }, ...(skill.files ?? [])]) {
      content.append(node('h3', '', file.path), node('pre', 'cortex-text cortex-code', file.text));
    }
    if (!canApprove()) content.append(node('p', 'small', 'Sign in to ohm with your linked account to approve a skill. A PDS token cannot approve it.'));
    if (!matches || !index.approved) {
      const approve = button('Approve this version', approveSkill, 'button primary');
      approve.disabled = !matches || !canApprove();
      content.append(approve);
    }
  }
  async function approveSkill() {
    if (!active || busy || !current?.skill || !canApprove() || current.index?.version !== current.version || current.index.approved) return;
    const { key, version } = current;
    await mutate('approveSkill', { name: key, version }, () => {
      current.index = { ...current.index, approved: true };
      if (skills.get(key)?.version === version) skills.set(key, { ...skills.get(key), approved: true });
    }, 'Skill version approved.');
  }

  renderDirectory(); renderDetail();
  return { directory, screen, open, reset, canLeave, hasDetail: () => Boolean(current) };
}
