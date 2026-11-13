import { getContext } from '../../../cortex/context.mjs';
import { notBuilt } from '../../../cortex/pending.mjs';

export default {
  name: 'Context',
  about: 'The private cortex at session start: always memories in full, an index of the rest, approved skills, enabled tools and work waiting to be settled.',
  requests: {
    'com.ohmmmm.cortex.getContext': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'Get the three initial memories without inventing identity or preferences. The vault-map entry includes a current, service-derived vault structure beside its editable memory. The version changes with the context.',
      takes: {},
      gives: '`always` ({memory, version}, with current `vault` on vault-map), `memories` (name, description, kind), `skills`, `tools`, `notes`, `turns` (waiting count), `version`',
      run: getContext,
    },
    'com.ohmmmm.cortex.recall': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'Not built yet. Prompt recall will use project isolation and a character budget.',
      takes: { q: 'the prompt', project: 'optional: the repository', budget: 'optional: 1,500 characters unless said' },
      gives: '`memories` (name, description, passage), `skills` (name, description), within the budget',
      run: notBuilt,
    },
  },
};
