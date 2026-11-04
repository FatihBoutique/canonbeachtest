(() => {
  const $ = (id) => document.getElementById(id);
  const configReady = window.FATIH_SUPABASE_URL && !window.FATIH_SUPABASE_URL.includes("YOUR_") &&
    window.FATIH_SUPABASE_ANON_KEY && !window.FATIH_SUPABASE_ANON_KEY.includes("YOUR_");
  let supabaseClient, currentUser, currentProfile, currentRole = null;
  let chatChannel = null, chatChannelUserId = null;
  let reactionChannel = null;
  let postsGeneration = 0, postsLoading = false, postsQueued = false;
  let messages = [], reactions = [], authors = {};
  let oldestCursor = null, hasOlder = false, olderLoading = false;
  let initialLoaded = false, unseenInChat = 0, unreadCount = 0;
  let lastRead = null, activeUserId = null;
  let refreshTimer = null;
  const PAGE_SIZE = 50;
  const REACTIONS = ["👍", "❤️", "😂", "🎉"];
  const chatList = $("postsList");
  const readKey = (id) => `fatih-chat-read-v2:${id}`;
  const atBottom = () => chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight < 110;
  const chatVisible = () => !$('dashboardSection').classList.contains('hidden') && !document.hidden;
  function setReadDate(date) {
    if (!currentUser || !date) return;
    if (!lastRead || date > lastRead) {
      lastRead = date;
      try { localStorage.setItem(readKey(currentUser.id), date); } catch (_) {}
    }
  }
  function updateUnread() {
    const badge = $('unreadBadge');
    badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    badge.classList.toggle('hidden', unreadCount === 0);
  }
  function updateNewIndicator() {
    const show = unseenInChat > 0 && !atBottom() && chatVisible();
    $('newMessagesBtn').classList.toggle('hidden', !show);
    $('newMessagesText').textContent = unseenInChat === 1 ? '1 new message' : `${unseenInChat} new messages`;
  }
  function markReadIfVisible() {
    if (!currentUser || !chatVisible() || !atBottom()) return;
    const newest = messages[messages.length - 1];
    if (newest) setReadDate(newest.created_at);
    unreadCount = 0; unseenInChat = 0;
    updateUnread(); updateNewIndicator();
  }
  function scrollToLatest() {
    chatList.scrollTop = chatList.scrollHeight;
    markReadIfVisible();
    updateNewIndicator();
  }
  function disconnectChat() {
    postsGeneration++;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    if (chatChannel && supabaseClient) supabaseClient.removeChannel(chatChannel);
    if (reactionChannel && supabaseClient) supabaseClient.removeChannel(reactionChannel);
    chatChannel = reactionChannel = null;
    chatChannelUserId = null;
    messages = []; reactions = []; authors = {}; oldestCursor = null;
    hasOlder = false; initialLoaded = false; postsQueued = false;
    unseenInChat = unreadCount = 0; updateUnread(); updateNewIndicator();
    chatList.innerHTML = '<p class="muted">Loading messages…</p>';
    $('loadOlderBtn').classList.add('hidden');
  }
  async function verifyLiveAccess() {
    if (!currentUser) return false;
    const id = currentUser.id;
    try {
      if (currentRole) {
        const {data,error} = await supabaseClient.from('admins').select('role').eq('user_id',id).maybeSingle();
        if (error || !data || !['admin','editor'].includes(data.role)) {
          disconnectChat(); showOnly('suspendedView'); return false;
        }
      } else {
        const {data,error} = await supabaseClient.from('portal_participants').select('status').eq('user_id',id).maybeSingle();
        if (error || data?.status !== 'confirmed') {
          disconnectChat(); showOnly('suspendedView'); return false;
        }
      }
      return currentUser?.id === id;
    } catch (error) { console.warn('Could not verify live access',error); return false; }
  }
  function schedulePostsReload() {
    if (!currentUser || !chatVisible() && !initialLoaded) return;
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => { refreshTimer = null; loadPosts(); }, 120);
  }
  function connectChat() {
    if (!currentUser || chatChannelUserId === currentUser.id) return;
    if (chatChannel) supabaseClient.removeChannel(chatChannel);
    if (reactionChannel) supabaseClient.removeChannel(reactionChannel);
    const id = currentUser.id;
    chatChannelUserId = id;
    chatChannel = supabaseClient.channel(`fatih-chat-posts-${id}`)
      .on('postgres_changes', {event:'*',schema:'public',table:'portal_forum_posts'}, async payload => {
        if (currentUser?.id !== id || !(await verifyLiveAccess())) return;
        if (payload.eventType === 'DELETE' && payload.old?.id) {
          messages = messages.filter(m => String(m.id) !== String(payload.old.id));
          reactions = reactions.filter(r => String(r.post_id) !== String(payload.old.id));
          renderMessages({stickBottom:atBottom()});
        }
        schedulePostsReload();
      }).subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('Chat Realtime disconnected; reload to retry.');
      });
    reactionChannel = supabaseClient.channel(`fatih-chat-reactions-${id}`)
      .on('postgres_changes', {event:'*',schema:'public',table:'portal_message_reactions'}, async () => {
        if (currentUser?.id === id && await verifyLiveAccess()) refreshReactions();
      }).subscribe();
  }

  const statusViews = ["authView","pendingView","suspendedView","portalView"];
  const showOnly = (id) => statusViews.forEach(x => $(x).classList.toggle("hidden", x !== id));
  const message = (text, success=false) => { $("authMessage").textContent=text; $("authMessage").classList.toggle("success",success); };
  const toast = (text) => { const el=$("toast"); el.textContent=text; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2800); };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmt = (s) => new Date(s).toLocaleString([], {dateStyle:"medium",timeStyle:"short"});
  const isEmail = (v) => v.includes("@");
  const setBusy = (form,busy) => { const b=form.querySelector('button[type="submit"]'); b.disabled=busy; b.style.opacity=busy?".6":"1"; };


  // Staged participant-login integration. Leave disabled until server-side
  // rate limiting, access policies and end-to-end tests are complete.
  const PARTICIPANT_LOGIN_ENABLED = false;

  async function authCall(identifier, password) {
    // Preserve the existing administrator email/password authentication.
    if (isEmail(identifier)) {
      return supabaseClient.auth.signInWithPassword({ email: identifier, password });
    }

    if (!PARTICIPANT_LOGIN_ENABLED) {
      return { error: new Error("Participant phone login is not available yet. Please contact the organizer.") };
    }

    // This path is intentionally unreachable until the server is secured.
    // Supabase Auth, not the Edge Function, ultimately verifies the password.
    const { data, error } = await supabaseClient.functions.invoke("participant-login", {
      body: { phone_number: identifier, password },
    });
    if (error) return { error: new Error("Unable to sign in. Please try again.") };
    if (!data?.success || !data.session?.access_token || !data.session?.refresh_token) {
      return { error: new Error("Invalid phone number or password.") };
    }
    const result = await supabaseClient.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    return { data: result.data, error: result.error };
  }

   async function loadProfile() {
    // Check staff access first: existing admin/editor accounts do not need a participant row.
    const {data:adminRow,error:adminError}=await supabaseClient.from("admins").select("role").eq("user_id",currentUser.id).maybeSingle();
    if(adminError) throw adminError;
    currentRole=adminRow?.role || null;

    const {data,error}=await supabaseClient.from("portal_participants").select("*").eq("user_id",currentUser.id).maybeSingle();
    if(error) throw error;
    currentProfile=data;

    if(!currentRole) {
      if(!data || data.status==="pending") { disconnectChat(); showOnly("pendingView"); return; }
      if(data.status!=="confirmed") { disconnectChat(); showOnly("suspendedView"); return; }
    }

    const displayName = data?.username || currentUser.user_metadata?.username || currentUser.email || currentUser.phone || "Organizer";
    $("welcomeName").textContent=displayName;
    $("postingAs").textContent="@"+displayName;
    $("logoutBtn").classList.remove("hidden");
    document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",!currentRole));
    document.querySelector('[data-section="manage"]').classList.toggle("hidden",currentRole!=="admin");
    showOnly("portalView");
    await loadAnnouncements();
    if (activeUserId !== currentUser.id) {
      disconnectChat(); activeUserId = currentUser.id;
      try { lastRead = localStorage.getItem(readKey(currentUser.id)); } catch (_) { lastRead = null; }
    }
    await loadPosts(true);
    connectChat();
  }

   async function refreshSession() {
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(!session) { disconnectChat(); activeUserId=null; currentUser=null; currentRole=null; $("logoutBtn").classList.add("hidden"); document.querySelector('[data-section="manage"]')?.classList.add("hidden"); showOnly("authView"); return; }
    currentUser=session.user;
    $("logoutBtn").classList.remove("hidden");
    try { await loadProfile(); } catch(e) { console.error(e); toast("Could not load your account. Please refresh."); }
  }

  $("loginForm").addEventListener("submit",async e=>{
    e.preventDefault(); const form = e.currentTarget; setBusy(form,true); message("");
    try {
      const identifier=$("loginIdentifier").value.trim();
      const {error}=await authCall(identifier,$("loginPassword").value);
      if(error) throw error;
      await refreshSession();
    } catch(err) { message(err.message || "Unable to sign in."); }
    finally { setBusy(form,false); }
  });


  $("logoutBtn").addEventListener("click",async()=>{
    disconnectChat(); activeUserId=null;
    await supabaseClient.auth.signOut(); currentUser=null; currentProfile=null; currentRole=null;
    $("logoutBtn").classList.add("hidden"); showOnly("authView"); 
  });

  document.querySelectorAll(".nav-item").forEach(btn=>btn.addEventListener("click",async()=>{
    const section=btn.dataset.section;
    if(section==="manage" && currentRole!=="admin") return;
    document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b===btn));
    $("dashboardSection").classList.toggle("hidden", section === "manage");
     $("manageSection").classList.toggle("hidden", section !== "manage");
     if(section==="manage") await loadParticipants();
     else { if (!initialLoaded) await loadPosts(true); markReadIfVisible(); }
  }));


  $("announcementsToggle").addEventListener("click", () => {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    const panel = $("announcementsSection");
    const expanded = panel.classList.toggle("expanded");
    $("announcementsToggle").setAttribute("aria-expanded", String(expanded));
  });

   async function loadAnnouncements() {
    const list = $("announcementsList");
    const {data,error} = await supabaseClient.from("portal_announcements")
      .select("*").order("created_at",{ascending:false});
    if(error) {
      console.error("Announcement loading error:",error);
      list.innerHTML = '<p class="muted">Unable to load announcements.</p>';
      return;
    }
    $("announcementPreview").textContent = data.length
      ? data[0].title : "Organizer updates and important information";
    list.innerHTML = data.length
      ? data.map(a => `<article class="feed-card"><span class="pill">Official update</span><h3>${esc(a.title)}</h3><div class="feed-meta">FATIH BOUTIQUE · ${fmt(a.created_at)}</div><p>${esc(a.body)}</p></article>`).join("")
      : '<div class="feed-card"><p class="muted">No announcements yet. Official updates will appear here.</p></div>';
  }

  $("announcementForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const form = e.currentTarget;
    if(!currentRole) return;
    const title=$("announcementTitle").value.trim(), body=$("announcementBody").value.trim();
    const {error}=await supabaseClient.from("portal_announcements").insert({title,body,created_by:currentUser.id});
    if(error) { toast(error.message); return; }
    form.reset(); toast("Announcement published."); await loadAnnouncements();
  });

    

  function renderReactions(postId) {
    const list = reactions.filter(r => String(r.post_id) === String(postId));
    const grouped = REACTIONS.map(emoji => ({emoji, count:list.filter(r=>r.emoji===emoji).length,
      mine:list.some(r=>r.emoji===emoji && r.user_id===currentUser.id)})).filter(r=>r.count);
    return grouped.length ? `<div class="reaction-counts">${grouped.map(r=>
      `<button type="button" class="reaction-pill ${r.mine?'selected':''}" data-react="${esc(postId)}" data-emoji="${r.emoji}" aria-label="${r.emoji}: ${r.count}">${r.emoji} ${r.count}</button>`).join('')}</div>` : '';
  }
  function renderMessages({stickBottom=false, preserveScroll=false}={}) {
    const oldTop = chatList.scrollTop, oldHeight = chatList.scrollHeight;
    const menuOpen = chatList.querySelector('.reaction-menu:not(.hidden)')?.dataset.menu;
    chatList.innerHTML = messages.length ? messages.map(p => `
      <article class="chat-message ${p.user_id===currentUser.id?'mine':''}" data-post-id="${esc(p.id)}">
        <div class="chat-bubble">
          <div class="chat-author">${p.user_id===currentUser.id?'You': '@'+esc(authors[p.user_id] || 'organizer')}</div>
          <p class="chat-text">${esc(p.body)}</p>
          <div class="chat-time">${fmt(p.created_at)}</div>
          ${renderReactions(p.id)}
        </div>
        <div class="chat-actions">
          <button type="button" class="chat-action-btn" data-menu-toggle="${esc(p.id)}" aria-label="React to message" aria-expanded="${menuOpen===String(p.id)}">☺</button>
          <div class="reaction-menu ${menuOpen===String(p.id)?'':'hidden'}" data-menu="${esc(p.id)}">
            ${REACTIONS.map(e=>`<button type="button" data-react="${esc(p.id)}" data-emoji="${e}" aria-label="React ${e}">${e}</button>`).join('')}
          </div>
          ${(p.user_id===currentUser.id || currentRole==='admin')?`<button type="button" class="chat-action-btn" data-delete-post="${esc(p.id)}" aria-label="Delete message">⋯ Delete</button>`:''}
        </div>
      </article>`).join('') : '<p class="muted">No messages yet. Start the conversation.</p>';
    $('loadOlderBtn').classList.toggle('hidden', !hasOlder);
    if (preserveScroll) chatList.scrollTop = oldTop + chatList.scrollHeight - oldHeight;
    else if (stickBottom) chatList.scrollTop = chatList.scrollHeight;
    else chatList.scrollTop = oldTop;
    updateNewIndicator();
  }
  async function fetchAuthors() {
    if (!messages.length) return;
    const {data,error} = await supabaseClient.rpc('get_portal_forum_profiles');
    if (error) { console.warn('Could not fetch chat names', error); return; }
    authors = Object.fromEntries((data||[]).map(p=>[p.user_id,p.username]));
  }
  async function refreshReactions() {
    const generation = postsGeneration;
    if (!messages.length) { reactions=[]; return; }
    const ids = messages.map(m=>m.id);
    // Supabase URL filters have limits; fetch in batches to avoid very long requests.
    const rows=[];
    for (let i=0;i<ids.length;i+=75) {
      const {data,error} = await supabaseClient.from('portal_message_reactions')
        .select('post_id,user_id,emoji').in('post_id',ids.slice(i,i+75));
      if (error) { console.warn('Reactions unavailable: run Phase 2 SQL first.',error); return; }
      rows.push(...(data||[]));
    }
    if (generation!==postsGeneration) return;
    reactions=rows;
    renderMessages({preserveScroll:false,stickBottom:atBottom()});
  }
  async function loadPosts(initial=false) {
    if (!currentUser) return;
    if (postsLoading) { postsQueued=true; return; }
    postsLoading=true;
    const generation=postsGeneration, userId=currentUser.id;
    const wasAtBottom=atBottom();
    const previousNewest=messages[messages.length-1]?.created_at || null;
    try {
      const {data,error}=await supabaseClient.from('portal_forum_posts')
        .select('id,body,created_at,user_id')
        .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE);
      if (generation!==postsGeneration || currentUser?.id!==userId) return;
      if (error) { console.error(error); if(!initialLoaded) chatList.textContent='Unable to load chat messages.'; return; }
      const latest=[...(data||[])].reverse();
      const existingIds=new Set(latest.map(p=>String(p.id)));
      const older=initial?[]:messages.filter(p=>!existingIds.has(String(p.id)));
      messages=[...older,...latest].sort((a,b)=>a.created_at.localeCompare(b.created_at)||String(a.id).localeCompare(String(b.id)));
      if (initial || !initialLoaded) {
        hasOlder=(data||[]).length===PAGE_SIZE;
        oldestCursor=messages[0]?.created_at||null;
      }
      const fresh=previousNewest ? latest.filter(p=>p.created_at>previousNewest && p.user_id!==userId) : [];
      if (!initial && fresh.length && (!wasAtBottom || !chatVisible())) {
        unseenInChat+=fresh.length; unreadCount+=fresh.length;
      }
      // On initial load, count only the latest page since the last locally saved read timestamp.
      if (!initialLoaded && lastRead) unreadCount=latest.filter(p=>p.user_id!==userId && p.created_at>lastRead).length;
      initialLoaded=true;
      await fetchAuthors();
      if (generation!==postsGeneration || currentUser?.id!==userId) return;
      const reactionIds=messages.map(p=>p.id), all=[];
      for(let i=0;i<reactionIds.length;i+=75){
        const result=await supabaseClient.from('portal_message_reactions').select('post_id,user_id,emoji').in('post_id',reactionIds.slice(i,i+75));
        if(!result.error) all.push(...(result.data||[]));
        else { console.warn('Reactions need Phase 2 SQL setup:',result.error); break; }
      }
      if (generation!==postsGeneration || currentUser?.id!==userId) return;
      reactions=all;
      renderMessages({stickBottom:initial||wasAtBottom});
      updateUnread();
      if (initial||wasAtBottom) markReadIfVisible();
    } finally {
      postsLoading=false;
      if (postsQueued) { postsQueued=false; if(currentUser?.id===userId) schedulePostsReload(); }
    }
  }
  async function loadOlder() {
    if (!currentUser || !hasOlder || olderLoading || postsLoading || !oldestCursor) return;
    olderLoading=true; const button=$('loadOlderBtn'); button.disabled=true;
    const oldHeight=chatList.scrollHeight, oldTop=chatList.scrollTop;
    try {
      const {data,error}=await supabaseClient.from('portal_forum_posts')
        .select('id,body,created_at,user_id').lt('created_at',oldestCursor)
        .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE);
      if(error) throw error;
      const batch=[...(data||[])].reverse();
      const ids=new Set(messages.map(m=>String(m.id)));
      messages=[...batch.filter(p=>!ids.has(String(p.id))),...messages];
      hasOlder=(data||[]).length===PAGE_SIZE;
      oldestCursor=messages[0]?.created_at||null;
      await fetchAuthors();
      if (batch.length) {
        const result=await supabaseClient.from('portal_message_reactions').select('post_id,user_id,emoji').in('post_id',batch.map(p=>p.id));
        if(!result.error) reactions=[...(result.data||[]),...reactions];
      }
      renderMessages();
      chatList.scrollTop=oldTop+chatList.scrollHeight-oldHeight;
    } catch(error) {console.error(error);toast('Could not load older messages.');}
    finally {olderLoading=false;button.disabled=false;}
  }
  $('loadOlderBtn').addEventListener('click',loadOlder);
  chatList.addEventListener('scroll',()=>{markReadIfVisible();updateNewIndicator();});
  $('newMessagesBtn').addEventListener('click',scrollToLatest);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) {schedulePostsReload();markReadIfVisible();} });
  chatList.addEventListener('click',async event=>{
    const menu=event.target.closest('[data-menu-toggle]');
    if(menu){
      const id=menu.dataset.menuToggle;
      chatList.querySelectorAll('[data-menu]').forEach(el=>el.classList.toggle('hidden',el.dataset.menu!==id||!el.classList.contains('hidden')));
      menu.setAttribute('aria-expanded',String(!chatList.querySelector(`[data-menu="${id}"]`)?.classList.contains('hidden')));
      return;
    }
    const react=event.target.closest('[data-react]');
    if(react){
      const postId=react.dataset.react, emoji=react.dataset.emoji;
      const mine=reactions.find(r=>String(r.post_id)===postId&&r.user_id===currentUser.id);
      let error;
      if(mine && mine.emoji===emoji) ({error}=await supabaseClient.from('portal_message_reactions').delete().eq('post_id',postId).eq('user_id',currentUser.id));
      else ({error}=await supabaseClient.from('portal_message_reactions').upsert({post_id:postId,user_id:currentUser.id,emoji},{onConflict:'post_id,user_id'}));
      if(error) toast(error.message); else await refreshReactions();
      return;
    }
    const del=event.target.closest('[data-delete-post]');
    if(del){
      if(!confirm('Delete this message for everyone?'))return;
      const {error}=await supabaseClient.from('portal_forum_posts').delete().eq('id',del.dataset.deletePost);
      if(error)toast(error.message);else {toast('Message deleted.');await loadPosts();}
    }
  });
  $('postForm').addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget;
    const body=$('postBody').value.trim();if(!body||!currentUser)return;
    const btn=form.querySelector('[type="submit"]');btn.disabled=true;
    try{
      const {error}=await supabaseClient.from('portal_forum_posts').insert({body,user_id:currentUser.id});
      if(error)throw error;
      $('postBody').value='';await loadPosts();scrollToLatest();
    }catch(error){toast(error.message||'Could not send message.');}
    finally{btn.disabled=false;}
  });

  // Interface-only preview. No account creation request is sent from this version.
  $("toggleCreateParticipant").addEventListener("click", () => {
    if (currentRole !== "admin") return;
    const panel = $("createParticipantPanel");
    const isOpening = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !isOpening);
    $("toggleCreateParticipant").setAttribute("aria-expanded", String(isOpening));
    $("toggleCreateParticipant").textContent = isOpening ? "− Close form" : "+ Create Participant";
  });

  // Activate only the existing administrator-only creation form.
  const createForm = $("createParticipantForm");
  const createButton = createForm.querySelector('button[type="submit"]');
  ["createParticipantName", "createParticipantPhone", "createParticipantUsername", "createParticipantPassword"]
    .forEach(id => { $(id).disabled = false; });
  createButton.disabled = false;
  createButton.textContent = "Save participant";
  const createNote = createForm.querySelector("p.muted");
  const createPreview = $("createParticipantPanel")?.querySelector("p.muted");
  if (createPreview && createPreview !== createNote && /preview|aperçu/i.test(createPreview.textContent)) {
    createPreview.textContent = "Only administrators can create participant accounts.";
  }

  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (currentRole !== "admin" || !currentUser) {
      toast("Administrator access required.");
      return;
    }
    const full_name = $("createParticipantName").value.trim();
    const phone_number = $("createParticipantPhone").value.trim();
    const username = $("createParticipantUsername").value.trim();
    const password = $("createParticipantPassword").value;
    if (full_name.length < 2 || !phone_number || (username && !/^[A-Za-z0-9_]{3,24}$/.test(username)) || password.length < 8 || password.length > 128) {
      toast("Check the name, phone, username and password (8–128 characters).");
      return;
    }
    createButton.disabled = true;
    createButton.textContent = "Creating participant…";
    try {
      const { data, error } = await supabaseClient.functions.invoke("admin-create-participant", {
        body: { full_name, phone_number, username, password },
      });
      if (error) {
        // Supabase returns the function's JSON error in the response context.
        let detail = "Could not create participant.";
        if (error.context && typeof error.context.json === "function") {
          try { detail = (await error.context.json())?.error || detail; } catch (_) {}
        }
        throw new Error(detail);
      }
      if (!data?.success) throw new Error(data?.error || "Could not create participant.");
      createForm.reset();
      toast("Participant created successfully.");
      await loadParticipants();
    } catch (err) {
      console.error("Participant creation failed", err);
      toast(err?.message || "Could not create participant.");
    } finally {
      createButton.disabled = false;
      createButton.textContent = "Save participant";
    }
  });

  async function loadParticipants() {
    const list=$("participantsList");
    if(currentRole!=="admin") return;
    const {data,error}=await supabaseClient.from("portal_participants").select("user_id,full_name,username,status,created_at").order("created_at",{ascending:false});
    if(error) {list.innerHTML='<p class="muted">Unable to load participants. Check admin permissions.</p>';return;}
    list.innerHTML=data.length?data.map(p=>`<div class="participant-row"><div><div class="participant-name">${esc(p.full_name)} · @${esc(p.username)}</div><div class="participant-sub">${esc(p.user_id)} · Registered ${fmt(p.created_at)}</div><div class="status-label">Status: ${esc(p.status)}</div></div><div>${p.status!=="confirmed"?`<button class="small-button" data-status="${p.user_id}" data-value="confirmed">Approve</button>`:""}${p.status!=="suspended"?` <button class="small-button danger" data-status="${p.user_id}" data-value="suspended">Suspend</button>`:""}${p.status!=="pending"?` <button class="small-button" data-status="${p.user_id}" data-value="pending">Set pending</button>`:""}</div></div>`).join(""):'<p class="muted">No participant accounts yet.</p>';
    list.querySelectorAll("[data-status]").forEach(btn=>btn.addEventListener("click",async()=>{
      const {error}=await supabaseClient.rpc("admin_set_portal_participant_status",{target_user_id:btn.dataset.status,new_status:btn.dataset.value});
      if(error) toast(error.message); else {toast("Participant status updated.");loadParticipants();}
    }));
  }

 
  if (!configReady || !window.supabase) {
    showOnly("authView");
    message("Setup required: add your Supabase Project URL and anon/publishable key in config.js.");
    return;
  }

  supabaseClient = window.supabase.createClient(
    window.FATIH_SUPABASE_URL,
    window.FATIH_SUPABASE_ANON_KEY
  );

  refreshSession();

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    if (session) setTimeout(() => refreshSession(), 0);
    else disconnectChat();
  });
})();
