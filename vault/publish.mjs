// Publish: what would have to change in a member's repository for what is published to match
// their vault. This only works it out. Nothing here writes anywhere: the writing is done by the
// member, signed in at their own PDS, from the list this returns.
//
// Three rules keep it safe to run against a repository that other software also writes to:
//   1. Only the shared post type is ever touched. A record of any other type is not looked at.
//   2. A record is removed only when it is known to be a post of this vault: one that is no longer
//      for everyone, or one the member removed. A record the vault knows nothing about is left
//      where it is and named, so the member can bring it in first.
//   3. A post that cannot be published is named with the reason, and whatever is published of it
//      now stays as it is.
import { OTHER } from '../feed/forms.mjs';
import { POST, postPath } from '../feed/pds.mjs';
import { mediaLayout, postRecord, slugOf } from './file.mjs';
import { differences } from './import.mjs';

const told = post => ({ id: post.id, slug: post.slug, ...(post.title ? { title: post.title } : {}) });
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// What differs between the record that is published and the one the vault would publish, in
// plain words. An attachment counts by where it is placed, not by the name it is placed under.
function changes(before, after, attachments, { did, origin }) {
  const found = differences(before, after).map(line => line.split(':')[0]);
  if ((before.slug ?? null) !== (after.slug ?? null) && before.slug !== undefined) found.push('slug');
  if (!same(before.connect ?? [], after.connect ?? [])) found.push('what it connects to');
  const earlier = new Map((before.media ?? []).map(item => [item.id, item]));
  const wanted = new Map(attachments.map(item => [item.id, item]));
  const was = mediaLayout(before.body).placements, now = mediaLayout(after.body).placements;
  const matches = (old, next) => {
    if (!old || !next) return false;
    let sameFile = old.sourceUrl === next.address;
    if (!sameFile && origin && URL.canParse(next.address)) {
      const address = new URL(next.address);
      sameFile = address.origin === new URL(origin).origin && address.pathname === '/xrpc/com.atproto.sync.getBlob' &&
        address.searchParams.get('did') === did && address.searchParams.get('cid') === old.file?.ref?.$link;
    }
    // Only images store alt metadata; every embed's descriptive text is compared in the body.
    const sameAlt = old.$type !== `${after.$type}#image` || (old.alt ?? '') === (next.alt ?? '');
    return sameFile && (!next.kind || old.$type === `${after.$type}#${next.kind}`) && sameAlt;
  };
  if (was.length !== now.length || now.some((id, index) => !matches(earlier.get(was[index]), wanted.get(id)))) found.push('attachments');
  return [...new Set(found)];
}

//   posts      every post in the vault, in full
//   removed    the IDs of posts the member has removed from the vault
//   published  the records of the shared post type in the member's repository, by their key
// Returns the summary a person reads (create, replace, remove, unchanged, cannot, notInVault) and
// `writes`: the changes themselves, each with the record to write and the attachments it places.
export function publishPlan({ did, site, origin, collection = POST, posts, removed = [], published = new Map(), now = new Date() }) {
  const byId = new Map(posts.map(post => [post.id, post]));
  const bySlug = new Map(posts.map(post => [post.slug, post]));
  const everyone = posts.filter(post => post.visibility === 'public');
  // A link to another post, written as its name, becomes that post's address. Only a post that
  // is for everyone can be linked to from one that is published.
  const address = post => post.address ?? new URL(postPath({ label: post.label || OTHER, sublabel: post.sublabel }, post.slug), site).href;
  const named = name => everyone.find(post => post.slug === slugOf(name) || (post.title ?? '').trim().toLowerCase() === name.trim().toLowerCase());
  const noteAddress = name => { const post = named(name); return post ? address(post) : undefined; };
  const postId = slug => (bySlug.get(slug)?.visibility === 'public' ? bySlug.get(slug).id : undefined);

  const plan = { create: [], replace: [], remove: [], unchanged: 0, cannot: [], notInVault: [], writes: [] };
  // Records published under a slug, from before posts had IDs, that this plan moves to their ID.
  const moved = new Set();

  for (const post of everyone) {
    const there = published.get(post.id);
    const legacy = !there && post.slug !== post.id && !byId.has(post.slug) ? published.get(post.slug) : undefined;
    const before = there ?? legacy;
    // A post with no date is published as of now the first time, and keeps that date afterwards.
    const made = postRecord(post, { did, site, collection, noteAddress, postId, seenAt: before?.publishedAt ?? now.toISOString() });
    if (made.problems.length || !made.record) {
      plan.cannot.push({ ...told(post), problems: made.problems, ...(before ? { stays: 'What is published now stays as it is.' } : {}) });
      if (legacy) moved.add(post.slug);
      continue;
    }
    const write = { rkey: post.id, slug: post.slug, record: made.record, attachments: made.attachments, ...(before ? { before } : {}) };
    if (there) {
      const differs = changes(there, made.record, made.attachments, { did, origin });
      if (!differs.length) { plan.unchanged++; continue; }
      plan.replace.push({ ...told(post), changes: differs });
      plan.writes.push({ action: 'update', ...write });
    } else if (legacy) {
      // The same post, published before posts had IDs: it moves to a record under its ID.
      moved.add(post.slug);
      plan.replace.push({ ...told(post), changes: [...changes(legacy, made.record, made.attachments, { did, origin }), 'its record moves to its permanent key'] });
      plan.writes.push({ action: 'create', ...write }, { action: 'delete', rkey: post.slug, slug: post.slug });
    } else {
      plan.create.push({ ...told(post), address: made.record.canonicalUrl });
      plan.writes.push({ action: 'create', ...write });
    }
  }

  const gone = new Set(removed);
  for (const [key, record] of published) {
    const post = byId.get(key) ?? (moved.has(key) ? undefined : bySlug.get(key));
    if (moved.has(key) || (post && post.visibility === 'public')) continue;
    const why = post ? (post.visibility === 'friends' ? 'It is now for friends.' : 'It is now only for you.')
      : gone.has(key) ? 'It was removed from the vault.' : null;
    if (!why) {
      plan.notInVault.push({ key, ...(record?.title ? { title: record.title } : {}) });
      continue;
    }
    plan.remove.push({ key, ...(post ? told(post) : {}), ...(!post && record?.title ? { title: record.title } : {}), why });
    plan.writes.push({ action: 'delete', rkey: key, ...(post ? { slug: post.slug } : {}) });
  }
  return plan;
}
