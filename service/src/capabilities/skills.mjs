import { pendingCapabilities } from '../../../cortex/pending.mjs';

export default pendingCapabilities.find(capability => capability.name === 'Skills');
