// Publish: making what is published in the member's own repository match their vault.
//
// The service only works out what would change. It holds no permission to write to anyone's
// repository: the member, signed in at their own PDS, makes the changes from the list this gives
// them. The working out is in ../../../vault/publish.mjs, with the rules that keep it safe.
import { POST } from '../../../feed/pds.mjs';
import { kindOf } from '../../../vault/core.mjs';
import { recordBody } from '../../../vault/file.mjs';
import { publishPlan } from '../../../vault/publish.mjs';
import { published, whereabouts } from '../member.mjs';
import { Refused } from '../store.mjs';

const LARGEST_FILE = 25_000_000;
const named = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 24);

// The address of a file the member's own PDS already holds says which one: its content ID.
function heldByPds(address, { pds, did }) {
  if (!URL.canParse(address)) return null;
  const url = new URL(address);
  if (url.origin !== new URL(pds).origin || url.pathname !== '/xrpc/com.atproto.sync.getBlob' || url.searchParams.get('did') !== did) return null;
  return url.searchParams.get('cid');
}

// The attachments a record places, as the entries it has to carry. A file the PDS already holds
// is named by its content ID and needs nothing sent. Any other is left for the member to send:
// it is listed under `upload`, and its entry is added once the PDS has it.
async function withAttachments(write, { get, pds, did, collection }) {
  const { attachments = [], before, ...rest } = write;
  if (rest.action === 'delete' || !attachments.length) return rest;
  const earlier = new Map((before?.media ?? []).map(entry => [entry?.file?.ref?.$link, entry]));
  const media = [];
  const upload = [];
  for (const item of attachments) {
    const cid = heldByPds(item.address, { pds, did });
    const kept = cid ? earlier.get(cid) : undefined;
    if (kept) {
      // The same file as is published now: its entry is kept whole, with what it says of the file.
      media.push({ ...kept, id: item.id, ...(kept.$type === `${collection}#image` ? { alt: item.alt ?? '' } : {}) });
    } else if (cid) {
      const look = await get(new URL(item.address.split('#')[0]), { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(20_000) }).catch(() => null);
      const mime = look?.ok ? (look.headers.get('Content-Type') ?? '').split(';')[0].trim() : '';
      const size = Number(look?.headers.get('Content-Length'));
      if (!mime || !Number.isSafeInteger(size) || size <= 0) throw new Refused(502, 'RepositoryUnreachable', `Your PDS would not say what the file "${item.id}" is`);
      const kind = kindOf(mime);
      media.push({ $type: `${collection}#${kind}`, id: item.id, file: { $type: 'blob', ref: { $link: cid }, mimeType: mime, size }, ...(item.alt && kind === 'image' ? { alt: item.alt } : {}) });
    } else {
      upload.push({ id: item.id, address: item.address, ...(item.alt ? { alt: item.alt } : {}) });
    }
  }
  return { ...rest, record: { ...rest.record, ...(media.length ? { media } : {}) }, ...(upload.length ? { upload } : {}) };
}

export default {
  name: 'Publish',
  about: 'Work out what would have to change in the member\'s own repository for what is published to match their vault. The service changes nothing there and holds no permission to: the member, signed in at their own PDS, makes the changes from the list. Only the shared post type is touched, and a record the vault knows nothing about is never removed.',
  requests: {
    'com.ohmmmm.vault.getPublishPlan': {
      verb: 'GET', asks: 'member', changes: false,
      about: 'What publishing would do: the posts it would publish for the first time, replace and take down, the ones that cannot be published and why, and the published records the vault knows nothing about. With `prepare`, also the changes themselves, ready to be made.',
      takes: { prepare: 'optional: `1` to include `writes`, the changes to make' },
      gives: '`repository`, `pds`, `collection`, `create`, `replace`, `remove`, `unchanged`, `cannot`, `notInVault`, `changes` (how many); and with `prepare`, `writes` and `plan`, a name for exactly these changes',
      run: async context => {
        const { url, get, did, posts } = context;
        const { pds, site } = await whereabouts(context);
        const plan = publishPlan({
          did, site, origin: pds, collection: POST, posts: await posts.all(did), removed: await posts.removed(did), published: await published(get, pds, did, POST),
        });
        const { writes, ...summary } = plan;
        const answer = { repository: did, pds, collection: POST, ...summary, changes: plan.create.length + plan.replace.length + plan.remove.length };
        if (url.searchParams.get('prepare') !== '1') return answer;
        const ready = [];
        for (const write of writes) ready.push(await withAttachments(write, { get, pds, did, collection: POST }));
        // The name stands for exactly these changes, so a yes given to one list is not a yes to another.
        return { ...answer, writes: ready, plan: `p${await named(ready)}` };
      },
    },
    'com.ohmmmm.vault.getAttachment': {
      verb: 'GET', asks: 'member', changes: false,
      // Publishing a post sends a copy of each file it places to the member's PDS. A page in a
      // browser cannot read a file from another website, so the service fetches it for them. It
      // fetches only an address one of the member's own posts already places.
      about: 'One file that one of the member\'s posts places, fetched from where the post says it is. It answers with the file itself, not JSON. It is for publishing, which sends a copy of each such file to the member\'s PDS.',
      takes: { id: 'the post\'s ID', attachment: 'the name the post\'s record places the file under' },
      gives: 'The file, with its type',
      run: async ({ url, get, did, posts }) => {
        const { post } = await posts.read(did, url.searchParams.get('id'));
        const item = recordBody(post.body ?? '').attachments.find(each => each.id === url.searchParams.get('attachment'));
        if (!item) throw new Refused(404, 'NotFound', 'The post places no such file');
        if (!/^https:\/\//i.test(item.address) || !URL.canParse(item.address)) throw new Refused(400, 'InvalidRequest', `The file "${item.id}" is not at a web address the service can fetch`);
        const fetched = await get(new URL(item.address.split('#')[0]), { redirect: 'follow', signal: AbortSignal.timeout(30_000) }).catch(() => null);
        if (!fetched?.ok) throw new Refused(502, 'FileUnreachable', `The file "${item.id}" could not be fetched from where the post says it is`);
        const bytes = new Uint8Array(await fetched.arrayBuffer());
        if (!bytes.length || bytes.length > LARGEST_FILE) throw new Refused(413, 'TooLarge', `The file "${item.id}" is empty or larger than 25 MB`);
        const mime = (fetched.headers.get('Content-Type') ?? '').split(';')[0].trim() || 'application/octet-stream';
        return new Response(bytes, { headers: {
          'Content-Type': mime, 'Content-Disposition': 'attachment', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
        } });
      },
    },
  },
};
