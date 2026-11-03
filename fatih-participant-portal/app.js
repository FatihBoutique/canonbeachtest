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

  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
    $("loginForm").classList.toggle("hidden",tab!=="login");
    $("registerForm").classList.toggle("hidden",tab!=="register");
    message("");
  }
  document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.tab)));

  async function authCall(identifier,password,signupData=null) {
    const payload = isEmail(identifier)
      ? {email:identifier,password}
      : {phone:identifier,password};
    return signupData
      ? supabaseClient.auth.signUp({...payload, options:{data:signupData}})
      : supabaseClient.auth.signInWithPassword(payload);
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
    if(!session) { currentUser=null; $("logoutBtn").classList.add("hidden"); showOnly("authView"); return; }
    currentUser=session.user;
    $("logoutBtn").classList.remove("hidden");
    try { await loadProfile(); } catch(e) { console.error(e); toast("Could not load your account. Please refresh."); }
  }

  $("loginForm").addEventListener("submit",async e=>{
    e.preventDefault(); setBusy(e.currentTarget,true); message("");
    try {
      const identifier=$("loginIdentifier").value.trim();
      const {error}=await authCall(identifier,$("loginPassword").value);
      if(error) throw error;
      await refreshSession();
    } catch(err) { message(err.message || "Unable to sign in."); }
    finally { setBusy(e.currentTarget,false); }
  });

  $("registerForm").addEventListener("submit",async e=>{
    e.preventDefault(); setBusy(e.currentTarget,true); message("");
    const username=$("regUsername").value.trim();
    if(!/^[A-Za-z0-9_]{3,24}$/.test(username)) { message("Username must be 3–24 characters: letters, numbers or underscores."); setBusy(e.currentTarget,false); return; }
    try {
      const identifier=$("regIdentifier").value.trim();
      const {data,error}=await authCall(identifier,$("regPassword").value,{
        full_name:$("regName").value.trim(), username
      });
      if(error) throw error;
      if(data.session) {
        currentUser=data.user; await loadProfile();
        message("Account created. Await organizer confirmation.",true);
      } else {
        message("Account created. Check your email or phone for the verification step, then sign in. Your access remains pending until approved.",true);
      }
    } catch(err) { message(err.message || "Unable to create account."); }
    finally { setBusy(e.currentTarget,false); }
  });

  $("logoutBtn").addEventListener("click",async()=>{
    await supabaseClient.auth.signOut(); currentUser=null; currentProfile=null; currentRole=null;
    $("logoutBtn").classList.add("hidden"); showOnly("authView"); switchTab("login");
  });

  document.querySelectorAll(".nav-item").forEach(btn=>btn.addEventListener("click",async()=>{
    const section=btn.dataset.section;
    if(section==="manage" && currentRole!=="admin") return;
    document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b===btn));
    ["announcements","forum","manage"].forEach(s=>$(s+"Section").classList.toggle("hidden",s!==section));
    if(section==="manage") await loadParticipants();
  }));

   async function loadAnnouncements() {
    const list=$("announcementsList");
    const {data,error}=await supabaseClient.from("portal_announcements").select("*").order("created_at",{ascending:false});
    if(error) { list.innerHTML='<p class="muted">Unable to load announcements.</p>'; console.error(error); return; }
    list.innerHTML=data.length ? data.map(a=>`<article class="feed-card"><span class="pill">Official update</span><h3>${esc(a.title)}</h3><div class="feed-meta">FATIH BOUTIQUE · ${fmt(a.created_at)}</div><p>${esc(a.body)}</p></article>`).join("") : '<div class="feed-card"><p class="muted">No announcements yet. Official updates will appear here.</p></div>';
  }

  $("announcementForm").addEventListener("submit",async e=>{
    e.preventDefault();
    if(!currentRole) return;
    const title=$("announcementTitle").value.trim(), body=$("announcementBody").value.trim();
    const {error}=await supabaseClient.from("portal_announcements").insert({title,body,created_by:currentUser.id});
    if(error) { toast(error.message); return; }
    e.currentTarget.reset(); toast("Announcement published."); await loadAnnouncements();
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
        .from("portal_participants")
        .select("user_id,username")
        .in("user_id", authorIds);

    if (profileError) {
      list.innerHTML = '<p class="muted">Unable to load discussion authors.</p>';
      console.error("Forum author loading error:", profileError);
      return;
    }

    usernameByUserId = Object.fromEntries(
      (profiles || []).map(p => [p.user_id, p.username])
    );
  }

  list.innerHTML = data.length
    ? data.map(p => `
        <article class="feed-card">
          <div class="feed-meta">
            @${esc(usernameByUserId[p.user_id] || "participant")}
            · ${fmt(p.created_at)}
          </div>
          <p>${esc(p.body)}</p>
          ${
            (p.user_id === currentUser.id || currentRole === "admin")
              ? `<div class="post-actions">
                   <button class="small-button danger"
                     data-delete-post="${p.id}">
                     Delete
                   </button>
                 </div>`
              : ""
          }
        </article>
      `).join("")
    : '<div class="feed-card"><p class="muted">No discussions yet. Start the conversation.</p></div>';

 
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
