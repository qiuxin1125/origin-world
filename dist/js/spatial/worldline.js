const WORLD_NAMES = {
  origin: '群岛会客厅',
  tide: '潮汐档案馆',
  forest: '雾林邮局',
};

const EVENT_LABELS = {
  post_publish: '留下动态',
  post_seen: '看见动态',
  social_arrival: '来到身边',
  affection_invitation: '提出邀请',
  affection_reply: '回应邀请',
  publish: '留下动态',
  publishPost: '留下动态',
  publication: '留下动态',
  social_seen: '看见动态',
  social_reaction: '作出回应',
  social_comment: '接续话题',
  social_approach: '走近',
  social_arrive: '相遇',
  social_invite: '发出邀请',
  affection: '相处',
  photograph: '拍下照片',
  exhibit: '展出照片',
};

function element(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}

function button(label, action, className = '') {
  const node = element('button', className, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function timeLabel(value) {
  const stamp = new Date(value || Date.now());
  if (Number.isNaN(stamp.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(stamp);
}

function photoImage(dataUrl, className, alt) {
  if (
    typeof dataUrl !== 'string' ||
    !/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)
  )
    return null;
  const image = element('img', className);
  image.src = dataUrl;
  image.alt = alt;
  image.loading = 'lazy';
  return image;
}

function avatar(name, color, small = false, actorId = '') {
  const node = element(
    'span',
    'wl-avatar' + (small ? ' wl-avatar-small' : ''),
    Array.from(name || '你')[0],
  );
  if (/^#[a-f\d]{6}$/i.test(color || '')) node.style.setProperty('--resident-color', color);
  if (actorId) {
    const known = {
      self: 'shore-wanderer',
      'self-view': 'shore-wanderer',
      shiyi: 'shore-wanderer',
      wenxi: 'garden-muse',
      'forest-post': 'garden-muse',
      post: 'letter-keeper',
    };
    const variants = ['garden-muse', 'shore-wanderer', 'letter-keeper'];
    const hash = Array.from(actorId).reduce((sum, character) => sum + character.codePointAt(0), 0);
    const portrait = element('img', 'wl-avatar-portrait');
    portrait.src = 'assets/models/' + (known[actorId] || variants[hash % variants.length]) + '.webp';
    portrait.alt = '';
    node.replaceChildren(portrait);
  }
  node.setAttribute('aria-hidden', 'true');
  return node;
}

export function mountWorldline(host, options) {
  const { store, close, enterWorld, notify = () => {} } = options;
  let state = options.getState ? options.getState() : store.snapshot();
  let tab = ['stories', 'feed', 'residents'].includes(options.initialTab)
    ? options.initialTab
    : 'stories';
  let selectedChapter = null;
  let disposed = false;
  let photoId = options.composePhotoId || null;
  let scope = 'world';
  let photoSignature = '';
  let composer;
  let composerText;
  let composerError;
  let photoChoices;
  let submitButton;
  let postedText = '';
  const root = element('section', 'worldline');
  const header = element('header', 'wl-header');
  const heading = element(
    'div',
    'wl-title-wrap',
    element('span', 'wl-flower'),
    element(
      'div',
      '',
      element('h2', 'wl-title', '世界线'),
      element('p', 'wl-subtitle', '相遇之后，事情还在继续。'),
    ),
  );
  heading.querySelector('h2').id = 'panel-heading';
  header.append(heading, button('×', leave, 'wl-close'));
  header.lastElementChild.setAttribute('aria-label', '关闭世界线');

  const cover = element('div', 'wl-cover');
  const coverCopy = element(
    'div',
    'wl-cover-copy',
    element('span', 'wl-current-label', '当前所在'),
    element('h3', 'wl-current-world'),
    element('p', 'wl-current-person'),
  );
  const returnButton = button('进入现场', visitScene, 'wl-button wl-button-primary');
  cover.append(coverCopy, returnButton);
  const nav = element('nav', 'wl-nav');
  nav.setAttribute('aria-label', '世界线内容');
  const tabs = element('div', 'wl-tabs');
  const tabButtons = new Map();
  for (const [key, label] of [
    ['stories', '故事'],
    ['feed', '动态'],
    ['residents', '居民'],
  ]) {
    const item = button(label, () => changeTab(key), 'wl-tab');
    item.dataset.worldlineTab = key;
    tabButtons.set(key, item);
    tabs.append(item);
  }
  const hosting = element('label', 'wl-hosting');
  const hostingSwitch = element('input', '');
  hostingSwitch.type = 'checkbox';
  hostingSwitch.setAttribute('aria-label', '开启前台托管演示');
  const hostingLabel = element('span', '', '前台托管演示');
  hosting.append(hostingSwitch, element('span', 'wl-switch'), hostingLabel);
  hostingSwitch.addEventListener('change', () => {
    const result = store.act('setSocialEnabled', { enabled: hostingSwitch.checked });
    if (!result.ok) notify(result.error || '暂时无法调整托管状态。');
    refresh();
  });
  nav.append(tabs, hosting);
  const body = element('div', 'wl-body');
  const footer = element('footer', 'wl-footer');
  const modeNote = element(
    'details',
    'wl-mode-note',
    element('summary', '', '关于这一期演示'),
    element(
      'p',
      '',
      '居民根据兴趣和已经看见的内容作出不同回应。本期使用本地社会机制，页面打开时推进，关闭页面后暂停。模型决策与离线托管将在后续接入。',
    ),
  );
  footer.append(modeNote);
  root.append(header, cover, nav, body, footer);
  host.replaceChildren(root);
  host.classList.add('worldline-dialog');
  const unsubscribe = store.subscribe ? store.subscribe(update) : () => {};
  host.addEventListener('close', onHostClose);
  update(state);
  if (photoId && tab === 'feed') requestAnimationFrame(() => composerText?.focus());

  function currentName() {
    if (state.actorId === 'self') return state.self?.name || '你';
    return state.actors.find((actor) => actor.id === state.actorId)?.name || '旅人';
  }

  function person(id) {
    if (id === 'self') return { id, name: state.self?.name || '你', color: '#ac8c94' };
    return (
      state.actors.find((actor) => actor.id === id) || { id, name: '一位居民', color: '#a4afa3' }
    );
  }

  function worldName(id) {
    return WORLD_NAMES[id] || '群岛';
  }

  function refresh() {
    update(store.snapshot());
  }

  function leave() {
    if (disposed) return;
    close?.();
    if (host.open) host.close();
    dispose();
  }

  function visitScene(request) {
    leave();
    enterWorld?.(request?.mode ? request : {});
  }

  function changeTab(next) {
    tab = next;
    selectedChapter = null;
    renderBody();
    updateHeader();
  }

  function updateHeader() {
    root.querySelector('.wl-current-world').textContent = worldName(state.worldId);
    root.querySelector('.wl-current-person').textContent =
      state.actorId === 'self' ? '以本人身份参与' : '正在以「' + currentName() + '」的身份参与';
    hostingSwitch.checked = state.socialSettings?.enabled !== false;
    const unread = (state.chapters || []).filter(
      (chapter) => !chapter.readAt || chapter.updatedAt > chapter.readAt,
    ).length;
    tabButtons.forEach((node, key) => {
      node.classList.toggle('active', tab === key);
      node.setAttribute('aria-current', tab === key ? 'page' : 'false');
      node.textContent =
        key === 'stories' && unread
          ? '故事 · ' + unread
          : key === 'stories'
            ? '故事'
            : key === 'feed'
              ? '动态'
              : '居民';
    });
  }

  function update(next) {
    if (disposed) return;
    const lastActor = state.actorId;
    state = next || store.snapshot();
    if (lastActor !== state.actorId) {
      photoId = null;
      photoSignature = '';
      postedText = '';
      composer = null;
    }
    updateHeader();
    renderBody();
  }

  function renderBody() {
    if (tab === 'feed') renderFeed();
    else if (tab === 'residents') renderResidents();
    else renderStories();
  }

  function empty(title, copy, actions = []) {
    return element(
      'div',
      'wl-empty',
      element('span', 'wl-empty-orbit'),
      element('h3', '', title),
      element('p', '', copy),
      element('div', 'wl-empty-actions', actions),
    );
  }

  function renderStories() {
    const chapters = [...(state.chapters || [])].sort((a, b) => b.updatedAt - a.updatedAt);
    if (selectedChapter) {
      const chapter = chapters.find((item) => item.id === selectedChapter);
      if (chapter) {
        renderChapter(chapter);
        return;
      }
      selectedChapter = null;
    }
    if (!chapters.length) {
      body.replaceChildren(
        empty(
          '还没有写下的篇章',
          '留一张照片，或说说刚才的见闻。被看见的举动，可能在后来得到回音。',
          [
            button('发条动态', () => changeTab('feed'), 'wl-button wl-button-primary'),
            button(
              '进入现场拍照',
              () => visitScene({ mode: 'photo' }),
              'wl-button wl-button-quiet',
            ),
          ],
        ),
      );
      return;
    }
    const list = element('div', 'wl-stories');
    for (const chapter of chapters) {
      const post = state.feed?.find((item) => item.id === chapter.postId);
      const card = button(
        '',
        () => {
          selectedChapter = chapter.id;
          const result = store.act('readChapter', { chapterId: chapter.id });
          if (!result.ok) notify(result.error);
          refresh();
        },
        'wl-story',
      );
      const image = photoImage(post?.photoDataUrl, 'wl-story-image', '这段经历中的照片');
      if (image) card.append(image);
      const copy = element('div', 'wl-story-copy');
      const meta = element(
        'div',
        'wl-story-meta',
        element('span', '', worldName(chapter.worldId)),
        element('time', '', timeLabel(chapter.updatedAt)),
      );
      if (!chapter.readAt || chapter.updatedAt > chapter.readAt)
        meta.prepend(element('span', 'wl-new-dot'));
      copy.append(
        meta,
        element('h3', '', chapter.title || '又一段相遇'),
        element('p', '', chapter.summary || '一段共同经历正在留下后续。'),
      );
      const participants = element('div', 'wl-story-people');
      for (const id of (chapter.actorIds || []).slice(0, 5)) {
        const resident = person(id);
        const figure = avatar(resident.name, resident.color, true, resident.id);
        figure.title = resident.name;
        participants.append(figure);
      }
      participants.append(element('span', '', '阅读这段经历'), element('b', '', '↗'));
      copy.append(participants);
      card.append(copy);
      list.append(card);
    }
    body.replaceChildren(element('p', 'wl-section-note', '从发生过的事，读到后来。'), list);
  }

  function renderChapter(chapter) {
    const events = (chapter.sourceEventIds || [])
      .map((id) => state.events.find((event) => event.id === id))
      .filter(Boolean);
    const post = state.feed?.find((item) => item.id === chapter.postId);
    const page = element('article', 'wl-chapter');
    page.append(
      button(
        '‹ 所有故事',
        () => {
          selectedChapter = null;
          renderStories();
        },
        'wl-back',
      ),
      element(
        'div',
        'wl-chapter-meta',
        worldName(chapter.worldId) + ' · ' + timeLabel(chapter.updatedAt),
      ),
      element('h3', 'wl-chapter-title', chapter.title || '又一段相遇'),
    );
    const image = photoImage(post?.photoDataUrl, 'wl-chapter-image', '故事起点的实际照片');
    if (image) page.append(image);
    page.append(element('p', 'wl-chapter-summary', chapter.summary || ''));
    if (post)
      page.append(
        element(
          'section',
          'wl-chapter-origin',
          element('span', 'wl-caption', '起初'),
          element('p', '', post.actorName + '留下了一条动态。'),
          post.text && element('blockquote', '', post.text),
        ),
      );
    const timeline = element('div', 'wl-chapter-events');
    for (const event of events) {
      timeline.append(
        element(
          'article',
          'wl-chapter-event',
          element('span', 'wl-event-dot'),
          element(
            'div',
            '',
            element('span', 'wl-caption', EVENT_LABELS[event.type] || '发生的事'),
            element('p', '', event.text),
            element('time', '', timeLabel(event.time)),
          ),
        ),
      );
    }
    if (timeline.childElementCount) {
      const details = element(
        'details',
        'wl-chapter-source',
        element('summary', '', '展开这段经历'),
        timeline,
      );
      details.open = true;
      page.append(details);
    }
    const involved = (chapter.actorIds || []).map((id) => person(id));
    const changes = involved
      .map((resident) => {
        const actor = state.actors.find((item) => item.id === resident.id);
        return actor?.attitude?.[post?.actorId || state.actorId]?.text
          ? resident.name + ' · ' + actor.attitude[post?.actorId || state.actorId].text
          : null;
      })
      .filter(Boolean);
    if (changes.length)
      page.append(
        element(
          'section',
          'wl-chapter-changes',
          element('span', 'wl-caption', '留下的变化'),
          changes.map((text) => element('p', '', text)),
        ),
      );
    page.append(button('回到现场，接着相遇', visitScene, 'wl-button wl-button-primary'));
    body.replaceChildren(page);
  }

  function makeComposer() {
    composer = element('form', 'wl-composer');
    const actor = person(state.actorId);
    const author = element(
      'div',
      'wl-composer-author',
      avatar(actor.name, actor.color, false, actor.id),
      element('div', '', element('b', '', currentName()), element('p', '', '把刚才的见闻留在这里')),
    );
    composerText = element('textarea', 'wl-compose-text');
    composerText.placeholder = '这一刻，你想分享什么？';
    composerText.setAttribute('aria-label', '动态内容');
    composerText.maxLength = 400;
    composerText.rows = 4;
    composerText.value = postedText;
    composerText.addEventListener('input', () => {
      postedText = composerText.value;
      updateSubmit();
    });
    photoChoices = element('div', 'wl-photo-choices');
    photoChoices.setAttribute('aria-label', '选择你拍下的照片');
    const selectPhotoButton = button(
      '选择留影',
      () => {
        photoChoices.hidden = !photoChoices.hidden;
        if (
          !photoChoices.hidden &&
          !(state.photos || []).some((photo) => photo.ownerId === state.actorId)
        ) {
          notify('先到现场拿起相机，拍下你眼前的画面。');
        }
      },
      'wl-attach-button',
    );
    photoChoices.hidden = !photoId;
    const scopeSelect = element('select', 'wl-scope');
    scopeSelect.setAttribute('aria-label', '谁可以看到动态');
    for (const [value, label] of [
      ['world', '当前世界可见'],
      ['circle', '有共同经历的居民'],
    ]) {
      const option = element('option', '', label);
      option.value = value;
      scopeSelect.append(option);
    }
    scopeSelect.value = scope;
    scopeSelect.onchange = () => {
      scope = scopeSelect.value;
    };
    submitButton = element('button', 'wl-button wl-button-primary', '发布动态');
    submitButton.type = 'submit';
    composerError = element('p', 'wl-compose-error');
    composerError.setAttribute('role', 'alert');
    const controls = element(
      'div',
      'wl-compose-controls',
      selectPhotoButton,
      scopeSelect,
      submitButton,
    );
    composer.append(author, composerText, photoChoices, composerError, controls);
    composer.onsubmit = (event) => {
      event.preventDefault();
      const payload = { text: composerText.value.trim(), visibility: scope };
      if (photoId) payload.photoId = photoId;
      const result = store.act('publishPost', payload);
      if (!result.ok) {
        composerError.textContent = result.error || '暂时没有发布成功，请再试一次。';
        return;
      }
      composerText.value = '';
      postedText = '';
      photoId = null;
      composerError.textContent = '';
      photoSignature = '';
      refresh();
      notify('动态已经发布。留一点时间，看看谁会看见。');
    };
    updatePhotoChoices();
    updateSubmit();
    return composer;
  }

  function updateSubmit() {
    if (submitButton) submitButton.disabled = !postedText.trim() && !photoId;
  }

  function updatePhotoChoices() {
    if (!photoChoices) return;
    const photos = (state.photos || [])
      .filter((photo) => photo.ownerId === state.actorId)
      .slice()
      .reverse();
    const signature = photos.map((photo) => photo.id).join('/') + '/' + (photoId || '');
    if (signature === photoSignature) return;
    photoSignature = signature;
    photoChoices.replaceChildren();
    if (!photos.length) {
      photoChoices.append(
        element('p', 'wl-photo-empty', '还没有自己的留影。'),
        button('去现场拍一张', () => visitScene({ mode: 'photo' }), 'wl-button wl-button-quiet'),
      );
      return;
    }
    for (const photo of photos) {
      const pick = button(
        '',
        () => {
          photoId = photoId === photo.id ? null : photo.id;
          updatePhotoChoices();
          updateSubmit();
        },
        'wl-photo-pick',
      );
      pick.classList.toggle('selected', photoId === photo.id);
      pick.setAttribute(
        'aria-label',
        (photo.title || '留影') + (photoId === photo.id ? '，已选择' : ''),
      );
      pick.setAttribute('aria-pressed', String(photoId === photo.id));
      const image = photoImage(photo.dataUrl, '', photo.title || '你的留影');
      if (image) pick.append(image);
      pick.append(element('span', '', photo.title || '留影'));
      photoChoices.append(pick);
    }
  }

  function renderFeed() {
    let layout = body.querySelector('.wl-feed-layout');
    if (!layout) {
      layout = element('div', 'wl-feed-layout');
      const stream = element('section', 'wl-stream');
      stream.setAttribute('aria-label', '世界里的动态');
      layout.append(element('div', 'wl-feed-main', makeComposer(), stream));
      const side = element(
        'aside',
        'wl-feed-aside',
        element('span', 'wl-small-star'),
        element('h3', '', '相遇可以慢一点'),
        element('p', '', '有人会接住一句话，也有人正在忙自己的事。每一次回应，都有它自己的时机。'),
        button('去现场看看', visitScene, 'wl-button wl-button-quiet'),
      );
      layout.append(side);
      body.replaceChildren(layout);
    }
    updatePhotoChoices();
    updateSubmit();
    const stream = layout.querySelector('.wl-stream');
    const posts = [...(state.feed || [])].sort((a, b) => b.time - a.time);
    stream.replaceChildren(...posts.map(postCard));
    if (!posts.length)
      stream.append(
        element(
          'div',
          'wl-feed-empty',
          element('p', '', '世界里还没有新的动态。'),
          element('span', '', '你可以从一张照片，或一句随意的分享开始。'),
        ),
      );
  }

  function postCard(post) {
    const author = person(post.actorId);
    const card = element('article', 'wl-post');
    const postHead = element(
      'div',
      'wl-post-head',
      avatar(post.actorName || author.name, author.color, false, post.actorId),
      element(
        'div',
        '',
        element('b', '', post.actorName || author.name),
        element('p', '', worldName(post.worldId) + ' · ' + timeLabel(post.time)),
      ),
    );
    card.append(postHead);
    if (post.text) card.append(element('p', 'wl-post-text', post.text));
    const image = photoImage(post.photoDataUrl, 'wl-post-image', post.text || '这条动态里的照片');
    if (image) card.append(image);
    const reactions = post.reactions || [];
    const postFoot = element('div', 'wl-post-foot');
    if (reactions.length)
      postFoot.append(
        element(
          'span',
          'wl-likes',
          reactions
            .map((reaction) => reaction.actorName || person(reaction.actorId).name)
            .join('、') + ' 喜欢了这条动态',
        ),
      );
    postFoot.append(
      element(
        'span',
        'wl-seen',
        post.seenBy?.length
          ? post.seenBy.length + ' 位居民看过'
          : post.visibility === 'circle'
            ? '共同经历可见'
            : '当前世界可见',
      ),
    );
    card.append(postFoot);
    const comments = element('div', 'wl-comments');
    for (const comment of post.comments || []) {
      comments.append(
        element(
          'article',
          'wl-comment',
          avatar(
            comment.actorName || person(comment.actorId).name,
            person(comment.actorId).color,
            true,
            comment.actorId,
          ),
          element(
            'div',
            '',
            element('b', '', comment.actorName || person(comment.actorId).name),
            element('p', '', comment.text),
            element('time', '', timeLabel(comment.time)),
          ),
        ),
      );
    }
    if (comments.childElementCount) card.append(comments);
    const waiting = (state.pendingSocial || []).some((item) => item.postId === post.id);
    if (waiting && !comments.childElementCount && state.socialSettings?.enabled !== false) {
      card.append(element('p', 'wl-post-waiting', '正在等感兴趣的居民看见'));
    }
    const related = state.chapters?.find((chapter) => chapter.postId === post.id);
    if (related)
      card.append(
        button(
          '这次分享有了后续',
          () => {
            tab = 'stories';
            selectedChapter = related.id;
            store.act('readChapter', { chapterId: related.id });
            refresh();
          },
          'wl-post-story-link',
        ),
      );
    return card;
  }

  function renderResidents() {
    const list = element('div', 'wl-residents');
    for (const actor of state.actors || []) {
      const intent = actor.socialIntent;
      const intentName =
        intent?.kind === 'approach'
          ? '想走近，再聊一会儿'
          : intent?.kind === 'invite'
            ? '留着一个想一起做的邀请'
            : '在自己的节奏里生活';
      const card = element(
        'article',
        'wl-resident',
        element(
          'div',
          'wl-resident-head',
          avatar(actor.name, actor.color, false, actor.id),
          element(
            'div',
            '',
            element('h3', '', actor.name),
            element('span', '', worldName(actor.worldId)),
          ),
        ),
        element('p', 'wl-resident-goal', actor.goal || '留意身边的人和事。'),
        element(
          'div',
          'wl-resident-intent',
          element('i', ''),
          element('span', '', actor.id === state.actorId ? '正由你操控' : intentName),
        ),
      );
      const attitude = actor.attitude?.[state.actorId];
      if (attitude?.text)
        card.append(element('p', 'wl-resident-relation', '与你 · ' + attitude.text));
      list.append(card);
    }
    body.replaceChildren(
      element('p', 'wl-section-note', '每一位居民，都有自己正在在意的事。'),
      list,
      button('回到现场相遇', visitScene, 'wl-button wl-button-primary'),
    );
  }

  function onHostClose() {
    if (!host.open) dispose();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    host.classList.remove('worldline-dialog');
    host.removeEventListener('close', onHostClose);
  }

  return { update, dispose };
}
