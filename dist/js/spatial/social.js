// Local social policy for the first demo. Events remain the authority for memories and chapters.
const profiles = {
  wenxi: ['shore', 'archives', 'photography'],
  shiyi: ['people', 'photography', 'creation'],
  post: ['archives', 'shore'],
  'forest-post': ['letters', 'nature', 'people'],
};
const topicWords = {
  shore: /海|潮|岸|码头|灯塔|sea|coast|shore/i,
  archives: /档案|记录|历史|拓片|archive|history/i,
  photography: /照片|拍照|相机|摄影|合影|photo|camera/i,
  people: /朋友|相遇|一起|人们|贴贴|拥抱|陪伴|friend|together/i,
  creation: /创作|画|作品|写|音乐|故事|create|art|story/i,
  letters: /信|邮|寄|回音|letter|mail/i,
  nature: /林|树|花|自然|叶|forest|tree|flower/i,
};
const socialTypes = new Set([
  'publishPost',
  'socialPulse',
  'socialArrive',
  'inviteAffection',
  'readChapter',
  'setSocialEnabled',
]);
const worldNames = { origin: '群岛会客厅', tide: '潮汐档案馆', forest: '雾林邮局' };
const compact = (value, max = 50) =>
  Array.from(value || '')
    .slice(0, max)
    .join('');
const hash = (text) =>
  Array.from(text).reduce((value, c) => (value * 31 + c.codePointAt(0)) >>> 0, 17);

export function ensureSocialState(state) {
  state.feed ??= [];
  state.pendingSocial ??= [];
  state.chapters ??= [];
  state.socialSettings ??= { enabled: true, mode: 'local-demo' };
  state.socialSettings.mode = 'local-demo';
  for (const actor of state.actors) {
    actor.social ??= { interests: profiles[actor.id] || inferTags(actor.goal) };
    actor.socialIntent ??= null;
  }
  return state;
}

function inferTags(text, worldId, hasPhoto = false) {
  const found = Object.entries(topicWords)
    .filter(([, pattern]) => pattern.test(text || ''))
    .map(([tag]) => tag);
  if (hasPhoto) found.push('photography');
  if (worldId === 'tide') found.push('shore', 'archives');
  if (worldId === 'forest') found.push('nature', 'letters');
  return [...new Set(found)];
}

function acquainted(actor, authorId) {
  return Boolean(actor.attitude?.[authorId]) || actor.memories.some((m) => m.actorId === authorId);
}

function canSeePost(actor, post) {
  return (
    actor.id !== post.actorId &&
    actor.worldId === post.worldId &&
    (post.visibility === 'world' || acquainted(actor, post.actorId))
  );
}

function scoreInterest(actor, post) {
  const interests = new Set(actor.social?.interests || inferTags(actor.goal));
  return post.tags.reduce((value, tag) => value + (interests.has(tag) ? 1 : 0), 0);
}

function policyDecision(actor, post, state) {
  const score = scoreInterest(actor, post);
  if (!score) return { kind: 'ignore' };
  const quote = post.text
    ? '你写的「' + compact(post.text, 36) + '」'
    : '这张来自' + worldNames[post.worldId] + '的照片';
  if (
    actor.id === 'wenxi' &&
    post.tags.some((tag) => ['shore', 'archives', 'photography'].includes(tag))
  ) {
    return { kind: 'approach', text: quote + '让我想再看看。我想当面听听你是怎么注意到它的。' };
  }
  if (actor.id === 'shiyi') {
    return {
      kind: 'comment',
      text: quote + '我记下了。如果你愿意，下次见面想听听这之后还发生了什么。',
    };
  }
  const choice = hash(actor.id + post.id) % 3;
  if (choice === 0 && score === 1) return { kind: 'like' };
  const text =
    quote +
    '和我正在做的事有点关系。我想「' +
    compact(actor.goal, 38).replace(/[。！]$/, '') +
    '」。';
  return { kind: choice === 2 && !actor.socialIntent ? 'approach' : 'comment', text };
}

function makeChapter(state, time, { postId, requestId } = {}) {
  const related = state.events.filter((event) =>
    postId ? event.postId === postId : event.requestId === requestId,
  );
  const meaningful = related.filter(
    (event) => !['post_seen', 'social_ignore', 'post_publish'].includes(event.type),
  );
  if (!meaningful.length) return;
  const post = postId && state.feed.find((entry) => entry.id === postId);
  const key = postId || requestId;
  const first = related[0];
  const id = 'chapter-' + key;
  const existing = state.chapters.find((chapter) => chapter.id === id);
  const completedAffection = meaningful.some((event) => event.type === 'affection');
  const arrived = meaningful.some((event) => event.type === 'social_arrival');
  const title = post
    ? arrived
      ? '从一条动态开始的相遇'
      : '一条动态有了回音'
    : completedAffection
      ? '一次被共同接受的靠近'
      : '关于一次靠近的回答';
  const opening = post
    ? post.actorName +
      (post.photoId ? '分享了一张照片' : '留下一条动态') +
      (post.text ? '，写下「' + compact(post.text, 66) + '」。' : '。')
    : '';
  const summary =
    opening +
    meaningful
      .slice(-3)
      .map((event) => event.text)
      .join('');
  const sourceEventIds = [...new Set(related.map((event) => event.id))];
  const actorIds = [
    ...new Set(related.flatMap((event) => [event.actorId, event.to].filter(Boolean))),
  ];
  const value = {
    id,
    title,
    summary,
    worldId: first.worldId,
    actorIds,
    sourceEventIds,
    updatedAt: time,
    readAt: existing?.readAt || null,
    postId: postId || null,
    requestId: requestId || null,
  };
  if (existing) Object.assign(existing, value);
  else state.chapters.push(value);
}

export function isSocialAction(type) {
  return socialTypes.has(type);
}

export function performSocialAction(type, payload, state, time, helpers) {
  ensureSocialState(state);
  const { actorIn, pose, distance, id, witnessedEvent } = helpers;
  const actor = actorIn(state, state.actorId);
  const eventFor = (type, author, text, extra = {}) =>
    witnessedEvent(state, time, type, author, text, { witnessIds: [author.id], ...extra });
  if (type === 'setSocialEnabled') {
    if (typeof payload.enabled !== 'boolean') throw new Error('请选择是否推进本地托管演示。');
    state.socialSettings.enabled = payload.enabled;
    return { enabled: payload.enabled };
  }
  if (type === 'readChapter') {
    const chapter = state.chapters.find((entry) => entry.id === payload.chapterId);
    if (!chapter) throw new Error('没有找到这一章。');
    chapter.readAt = time;
    return { chapterId: chapter.id };
  }
  if (type === 'publishPost') {
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (Array.from(text).length > 500) throw new Error('动态请保留在 500 字以内。');
    const photo = payload.photoId
      ? state.photos.find((entry) => entry.id === payload.photoId)
      : null;
    if (payload.photoId && (!photo || photo.ownerId !== actor.id))
      throw new Error('只能分享当前角色亲自拍下的照片。');
    if (!text && !photo) throw new Error('写下一句话，或选一张自己的照片。');
    const visibility = payload.visibility || 'world';
    if (!['world', 'circle'].includes(visibility)) throw new Error('请选择动态的可见范围。');
    const postId = id('post');
    const tags = [
      ...new Set([
        ...inferTags(text, photo?.worldId || actor.worldId, Boolean(photo)),
        ...(Array.isArray(payload.tags)
          ? payload.tags
              .filter((tag) => typeof tag === 'string')
              .map((tag) => compact(tag, 24))
              .slice(0, 8)
          : []),
      ]),
    ];
    const publication = eventFor(
      'post_publish',
      actor,
      actor.name +
        (photo ? '分享了一张来自' + worldNames[photo.worldId] + '的照片' : '发布了一条动态') +
        (text ? '：「' + compact(text, 120) + '」。' : '。'),
      { postId, photoId: photo?.id || null, sourceId: photo?.sourceId || null },
    );
    const post = {
      id: postId,
      actorId: actor.id,
      actorName: actor.name,
      worldId: actor.worldId,
      text,
      photoId: photo?.id || null,
      time,
      visibility,
      tags,
      comments: [],
      reactions: [],
      seenBy: [],
      sourceId: publication.id,
    };
    state.feed.push(post);
    for (const candidate of state.actors.filter((entry) => canSeePost(entry, post))) {
      state.pendingSocial.push({
        id: id('social'),
        postId,
        actorId: candidate.id,
        dueAt: time + 10000 + (hash(candidate.id + postId) % 3) * 7000,
      });
    }
    return { postId, eventId: publication.id };
  }
  if (type === 'socialPulse') {
    if (!state.socialSettings.enabled) return { changed: false, processed: 0 };
    let changed = false,
      processed = 0;
    for (const resident of state.actors) {
      if (resident.socialIntent && resident.socialIntent.expiresAt <= time) {
        resident.socialIntent = null;
        changed = true;
      }
    }
    for (const job of [...state.pendingSocial]) {
      if (job.dueAt > time) continue;
      const resident = actorIn(state, job.actorId);
      if (resident?.id === state.actorId) {
        job.dueAt = time + 3000;
        changed = true;
        continue;
      }
      state.pendingSocial = state.pendingSocial.filter((entry) => entry.id !== job.id);
      changed = true;
      const post = state.feed.find((entry) => entry.id === job.postId);
      if (!resident || !post || !canSeePost(resident, post) || post.seenBy.includes(resident.id))
        continue;
      post.seenBy.push(resident.id);
      const seen = eventFor(
        'post_seen',
        resident,
        resident.name + '读到了' + post.actorName + '发布的动态。',
        { postId: post.id, sourceId: post.sourceId, to: post.actorId },
      );
      const decision = policyDecision(resident, post, state);
      processed++;
      if (decision.kind === 'ignore') continue;
      if (decision.kind === 'like') {
        const event = eventFor(
          'social_reaction',
          resident,
          resident.name + '为' + post.actorName + '的动态留下一枚喜欢。',
          {
            postId: post.id,
            sourceId: seen.id,
            to: post.actorId,
            witnessIds: [resident.id, post.actorId],
          },
        );
        post.reactions.push({
          actorId: resident.id,
          actorName: resident.name,
          kind: 'like',
          time,
          sourceId: event.id,
        });
      } else {
        const event = eventFor(
          'social_comment',
          resident,
          resident.name + '回应' + post.actorName + '：「' + decision.text + '」',
          {
            postId: post.id,
            sourceId: seen.id,
            to: post.actorId,
            witnessIds: [resident.id, post.actorId],
          },
        );
        post.comments.push({
          id: id('comment'),
          actorId: resident.id,
          actorName: resident.name,
          text: decision.text,
          time,
          sourceId: event.id,
        });
        resident.attitude[post.actorId] = { text: '想接着聊这次分享', sourceId: event.id };
        if (decision.kind === 'approach' && !resident.socialIntent) {
          resident.socialIntent = {
            kind: 'approach',
            targetActorId: post.actorId,
            sourceId: event.id,
            postId: post.id,
            expiresAt: time + 90000,
          };
        }
      }
      makeChapter(state, time, { postId: post.id });
    }
    return { changed, processed };
  }
  if (type === 'inviteAffection') {
    const recipient = actorIn(state, payload.to);
    if (!recipient || recipient.id === actor.id || recipient.worldId !== actor.worldId)
      throw new Error('请走近这里的一位居民。');
    if (recipient.id === state.actorId) throw new Error('这个角色正由你操控。');
    if (!['hug', 'photoTogether'].includes(payload.gesture)) throw new Error('请选择拥抱或合影。');
    if (distance(pose(state, actor.id), pose(state, recipient.id)) > 3.5)
      throw new Error('再靠近一点，让对方能看见你的邀请。');
    const gesture = payload.gesture,
      requestId = id('request');
    const request = eventFor(
      'affection_invitation',
      actor,
      actor.name + '邀请' + recipient.name + (gesture === 'hug' ? '拥抱。' : '一起合影。'),
      { requestId, to: recipient.id, gesture, witnessIds: [actor.id, recipient.id] },
    );
    const familiar = recipient.memories.filter(
      (m) => m.actorId === actor.id && !['affection_invitation', 'post_seen'].includes(m.type),
    ).length;
    const accepted =
      !recipient.held &&
      (familiar >= 2 ||
        Boolean(recipient.attitude[actor.id]) ||
        (gesture === 'photoTogether' && familiar >= 1));
    const replyText = accepted
      ? recipient.name +
        (gesture === 'hug' ? '点头接受了拥抱邀请，正准备走近。' : '答应了合影，正准备站到一起。')
      : recipient.name + '轻轻摇头，想先继续手上的事。';
    const reply = eventFor('affection_reply', recipient, replyText, {
      requestId,
      sourceId: request.id,
      to: actor.id,
      gesture,
      accepted,
      witnessIds: [actor.id, recipient.id],
    });
    if (accepted)
      recipient.socialIntent = {
        kind: 'affection',
        gesture,
        targetActorId: actor.id,
        sourceId: reply.id,
        requestId,
        expiresAt: time + 30000,
      };
    makeChapter(state, time, { requestId });
    return {
      accepted,
      gesture,
      to: recipient.id,
      eventId: request.id,
      intentSourceId: accepted ? reply.id : null,
    };
  }
  if (type === 'socialArrive') {
    const resident = actorIn(state, payload.actorId),
      intent = resident?.socialIntent;
    if (!resident || resident.id === state.actorId) throw new Error('这位角色正由真人操控。');
    if (!intent || intent.sourceId !== payload.sourceId || intent.expiresAt <= time)
      throw new Error('这段行动已结束或改变。');
    const target = actorIn(state, intent.targetActorId);
    if (!target || target.worldId !== resident.worldId) throw new Error('对方已经离开了这个世界。');
    const range = intent.kind === 'affection' ? 1.8 : 2.8;
    if (distance(pose(state, resident.id), pose(state, target.id)) > range)
      throw new Error('还没有真正走到对方身边。');
    const text =
      intent.kind === 'affection'
        ? resident.name +
          '和' +
          target.name +
          (intent.gesture === 'hug'
            ? '靠近并完成了彼此接受的拥抱。'
            : '并肩站在一起，准备留下合影。')
        : resident.name + '走到' + target.name + '身边，想继续聊那条分享。';
    const event = witnessedEvent(
      state,
      time,
      intent.kind === 'affection' ? 'affection' : 'social_arrival',
      resident,
      text,
      {
        sourceId: intent.sourceId,
        postId: intent.postId || null,
        requestId: intent.requestId || null,
        to: target.id,
        gesture: intent.gesture || null,
      },
    );
    resident.socialIntent = null;
    resident.attitude[target.id] = {
      text: intent.kind === 'affection' ? '记得这次彼此愿意的靠近' : '愿意接着聊这段分享',
      sourceId: event.id,
    };
    makeChapter(state, time, { postId: intent.postId, requestId: intent.requestId });
    return { eventId: event.id, gesture: intent.gesture || null };
  }
  throw new Error('暂不支持这项社交动作。');
}
