(() => {
  const $ = (id) => document.getElementById(id);
  const configReady = window.FATIH_SUPABASE_URL && !window.FATIH_SUPABASE_URL.includes("YOUR_") &&
    window.FATIH_SUPABASE_ANON_KEY && !window.FATIH_SUPABASE_ANON_KEY.includes("YOUR_");
  let supabaseClient, currentUser, currentProfile, currentRole = null;
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
      if(!data || data.status==="pending") { showOnly("pendingView"); return; }
      if(data.status!=="confirmed") { showOnly("suspendedView"); return; }
    }

    const displayName = data?.username || currentUser.user_metadata?.username || currentUser.email || currentUser.phone || "Organizer";
    $("welcomeName").textContent=displayName;
    $("postingAs").textContent="@"+displayName;
    $("logoutBtn").classList.remove("hidden");
    document.querySelectorAll(".admin-only").forEach(el=>el.classList.toggle("hidden",!currentRole));
    document.querySelector('[data-section="manage"]').classList.toggle("hidden",currentRole!=="admin");
    showOnly("portalView");
    await loadAnnouncements();
    await loadPosts();
  }

   async function refreshSession() {
    const {data:{session}}=await supabaseClient.auth.getSession();
    if(!session) { currentUser=null; currentRole=null; $("logoutBtn").classList.add("hidden"); document.querySelector('[data-section="manage"]')?.classList.add("hidden"); showOnly("authView"); return; }
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
  }));


  $("announcementsToggle").addEventListener("click", () => {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    const panel = $("announcementsSection");
    const expanded = panel.classList.toggle("expanded");
    $("announcementsToggle").setAttribute("aria-expanded", String(expanded));
  });

   async function loadAnnouncements() {
    const list=$("announcementsList");
    const {data,error}=await supabaseClient.from("portal_announcements").select("*").order("created_at",{ascending:false});
    if(error) { list.innerHTML='<p class="muted">Unable to load announcements.</p>'; console.error(error); return; }
     $("announcementPreview").textContent = data.length ? data[0].title : "No announcements yet";
    list.innerHTML=data.length ? data.map(a=>`<article class="feed-card"><span class="pill">Official update</span><h3>${esc(a.title)}</h3><div class="feed-meta">FATIH BOUTIQUE · ${fmt(a.created_at)}</div><p>${esc(a.body)}</p></article>`).join("") : '<div class="feed-card"><p class="muted">No announcements yet. Official updates will appear here.</p></div>';
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

    

async function loadPosts() {
  const list = $("postsList");

  list.innerHTML = '<p class="muted">Loading discussions...</p>';

  const { data, error } = await supabaseClient
    .from("portal_forum_posts")
    .select("id,body,created_at,user_id")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = '<p class="muted">Unable to load discussions.</p>';
    console.error("Forum loading error:", error);
    return;
  }

  const authorIds = [...new Set(
    (data || []).map(p => p.user_id).filter(Boolean)
  )];

  let usernameByUserId = {};

  if (authorIds.length) {
    const { data: profiles, error: profileError } =
      await supabaseClient
        
.rpc("get_portal_forum_profiles");


    if (profileError) {
      list.innerHTML = '<p class="muted">Unable to load discussion authors.</p>';
      console.error("Forum author loading error:", profileError);
      return;
    }

    usernameByUserId = Object.fromEntries(
      (profiles || []).map(p => [p.user_id, p.username])
    );
  }

  // Phase 1: present existing posts as separate chat bubbles; preserve permissions.
  const chronological = [...(data || [])].reverse();
  list.innerHTML = chronological.length
    ? chronological.map(p => `
        <article class="chat-message ${p.user_id === currentUser.id ? "mine" : ""}">
          <div class="chat-bubble">
            <div class="chat-author">${p.user_id === currentUser.id ? "You" : "@" + esc(usernameByUserId[p.user_id] || (currentRole && p.user_id !== currentUser.id ? "organizer" : "participant"))}</div>
            <p class="chat-text">${esc(p.body)}</p>
            <div class="chat-time">${fmt(p.created_at)}</div>
          </div>
          ${(p.user_id === currentUser.id || currentRole === "admin")
            ? `<div class="post-actions"><button type="button" class="small-button danger" data-delete-post="${esc(p.id)}">Delete</button></div>`
            : ""}
        </article>`).join("")
    : '<p class="muted">No messages yet. Start the conversation.</p>';
  // Phase 1 only: show the latest existing message on initial load.
  list.scrollTop = list.scrollHeight;

  list.querySelectorAll("[data-delete-post]").forEach(btn =>
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this discussion post?")) return;

      const { error } = await supabaseClient
        .from("portal_forum_posts")
        .delete()
        .eq("id", btn.dataset.deletePost);

      if (error) {
        toast(error.message);
      } else {
        toast("Post deleted.");
        await loadPosts();
      }
    })
  );
}



  $("postForm").addEventListener("submit",async e=>{
    e.preventDefault(); const body=$("postBody").value.trim(); if(!body)return;
    const {error}=await supabaseClient.from("portal_forum_posts").insert({body,user_id:currentUser.id});
    if(error) { toast(error.message); return; }
    $("postBody").value=""; toast("Your message has been posted."); await loadPosts();
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
  });
})();
