(() => {
  "use strict";
  const fr = {
  "Sign in": "Se connecter",
  "Log out": "Déconnexion",
  "A PRIVATE SPACE FOR CONFIRMED GUESTS": "UN ESPACE PRIVÉ POUR LES PARTICIPANTS CONFIRMÉS",
  "Your excursion.": "Votre excursion.",
  "Your space.": "Votre espace.",
  "Find official updates, connect with other participants and stay informed before excursion day.": "Retrouvez les annonces officielles, échangez avec les autres participants et restez informé avant le jour de l’excursion.",
  "✦ Official announcements": "✦ Annonces officielles",
  "✦ Participant discussions": "✦ Discussions entre participants",
  "✦ Excursion-day coordination": "✦ Coordination le jour de l’excursion",
  "Welcome back": "Bon retour",
  "Use your registered email address or phone number.": "Utilisez votre adresse e-mail ou votre numéro de téléphone enregistré.",
  "Email or phone number": "E-mail ou numéro de téléphone",
  "Password": "Mot de passe",
  "Your password": "Votre mot de passe",
  "Access is reserved for organizer-confirmed participants.": "Accès réservé aux participants confirmés par l’organisateur.",
  "ACCOUNT CREATED": "COMPTE CRÉÉ",
  "Awaiting confirmation": "En attente de confirmation",
  "Your account is registered, but the organizer has not yet confirmed your participation. The private portal will unlock once your status is approved.": "Votre compte est enregistré, mais votre participation n’a pas encore été confirmée. L’accès sera activé après validation.",
  "You can sign out and return later.": "Vous pouvez vous déconnecter et revenir plus tard.",
  "PORTAL ACCESS": "ACCÈS AU PORTAIL",
  "Access unavailable": "Accès indisponible",
  "Your participant access is currently suspended or your registration is no longer active. Please contact the organizer.": "Votre accès est suspendu ou votre inscription n’est plus active. Veuillez contacter l’organisateur.",
  "PRIVATE PARTICIPANT SPACE": "ESPACE PRIVÉ DES PARTICIPANTS",
  "Welcome,": "Bienvenue,",
  "participant": "participant",
  "Your information hub for Road to Canon Beach.": "Votre espace d’information pour Road to Canon Beach.",
  "Confirmed participant": "Participant confirmé",
  "Announcements": "Annonces",
  "Forum": "Forum",
  "Manage participants": "Gérer les participants",
  "STAY INFORMED": "RESTEZ INFORMÉ",
  "Official announcements": "Annonces officielles",
  "Publish an announcement": "Publier une annonce",
  "Announcement title": "Titre de l’annonce",
  "Write the information participants need...": "Rédigez les informations destinées aux participants...",
  "Visible to confirmed participants": "Visible par les participants confirmés",
  "Publish update": "Publier l’annonce",
  "Loading announcements…": "Chargement des annonces…",
  "COMMUNITY": "COMMUNAUTÉ",
  "Participant forum": "Forum des participants",
  "Share questions and useful information respectfully.": "Posez vos questions et partagez des informations utiles dans le respect.",
  "Start a discussion": "Lancer une discussion",
  "What would you like to share with other participants?": "Que souhaitez-vous partager avec les autres participants?",
  "Posting as": "Publication en tant que",
  "Post message": "Publier",
  "Loading discussions…": "Chargement des discussions…",
  "ORGANIZER TOOLS": "OUTILS ORGANISATEUR",
  "Participant management": "Gestion des participants",
  "Approve or suspend access. Only administrators can change participant status.": "Approuvez ou suspendez les accès. Seuls les administrateurs peuvent modifier les statuts.",
  "+ Create Participant": "+ Créer un participant",
  "− Close form": "− Fermer le formulaire",
  "Create a participant": "Créer un participant",
  "This form is a preview. Account creation will be enabled after the secure server function is updated and tested.": "Ce formulaire est un aperçu. La création sera activée après la mise à jour et les tests de la fonction sécurisée.",
  "Full name *": "Nom complet *",
  "Phone number *": "Numéro de téléphone *",
  "Username (optional)": "Nom d’utilisateur (facultatif)",
  "Password *": "Mot de passe *",
  "Participant's full name": "Nom complet du participant",
  "Administrator-defined password": "Mot de passe défini par l’administrateur",
  "The password will remain valid until changed or reset. Never share passwords in public messages.": "Le mot de passe reste valide jusqu’à sa modification ou sa réinitialisation. Ne le partagez jamais publiquement.",
  "Save participant — coming soon": "Enregistrer — bientôt disponible",
  "Loading participants…": "Chargement des participants…",
  "Private participant portal · 2026": "Portail privé des participants · 2026",
  "No participant accounts yet.": "Aucun compte participant pour le moment.",
  "Approve": "Approuver",
  "Suspend": "Suspendre",
  "Set pending": "Mettre en attente",
  "Delete": "Supprimer",
  "No announcements yet. Official updates will appear here.": "Aucune annonce pour le moment. Les informations officielles apparaîtront ici.",
  "No discussions yet. Start the conversation.": "Aucune discussion pour le moment. Lancez la conversation.",
  "Unable to load participants. Check admin permissions.": "Impossible de charger les participants. Vérifiez les autorisations.",
  "Unable to load announcements.": "Impossible de charger les annonces.",
  "Unable to load discussions.": "Impossible de charger les discussions.",
  "Unable to load discussion authors.": "Impossible de charger les auteurs des discussions.",
  "Could not load your account. Please refresh.": "Impossible de charger votre compte. Actualisez la page.",
  "Unable to sign in.": "Connexion impossible.",
  "Participant phone login is not available yet. Please contact the organizer.": "La connexion par téléphone sera bientôt disponible. Veuillez contacter l’organisateur.",
  "Unable to sign in. Please try again.": "Connexion impossible. Veuillez réessayer.",
  "Invalid phone number or password.": "Numéro de téléphone ou mot de passe incorrect.",
  "Announcement published.": "Annonce publiée.",
  "Your message has been posted.": "Votre message a été publié.",
  "Post deleted.": "Publication supprimée.",
  "Participant status updated.": "Statut du participant mis à jour.",
  "Delete this discussion post?": "Supprimer cette publication ?",
  "Status:": "Statut :",
  "Registered": "Inscrit le",
  "Official update": "Annonce officielle",
  "Setup required: add your Supabase Project URL and anon/publishable key in config.js.": "Configuration requise : renseignez l’URL Supabase et la clé publique dans config.js."
};
  const en = Object.fromEntries(Object.entries(fr).map(([k,v])=>[v,k]));
  let lang = localStorage.getItem("fatih_portal_lang") === "en" ? "en" : "fr";
  const originals = new WeakMap();
  const placeholders = new WeakMap();
  const translate = (source) => {
    if (lang === "en") return source;
    if (Object.prototype.hasOwnProperty.call(fr,source)) return fr[source];
    const lead = source.match(/^\s*/)?.[0] || "";
    const tail = source.match(/\s*$/)?.[0] || "";
    const core = source.trim();
    if (Object.prototype.hasOwnProperty.call(fr,core)) return lead+fr[core]+tail;
    return source.replace(/\b(Status:|Registered|Official update)\b/g,m=>fr[m]||m);
  };
  function visit(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.nodeValue.trim()) return;
      let original = originals.get(node);
      const current = node.nodeValue;
      if (original === undefined || (current !== original && current !== translate(original))) {
        original = en[current.trim()] || current;
        originals.set(node,original);
      }
      const next = translate(original);
      if (current !== next) node.nodeValue = next;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (["SCRIPT","STYLE"].includes(node.tagName)) return;
      for (const attr of ["placeholder","title"]) {
        if (!node.hasAttribute(attr)) continue;
        let original = placeholders.get(node)?.[attr];
        const current = node.getAttribute(attr);
        if (original === undefined || (current !== original && current !== translate(original))) original=current;
        placeholders.set(node,{...(placeholders.get(node)||{}),[attr]:original});
        const next=translate(original);
        if (current !== next) node.setAttribute(attr,next);
      }
      for (const child of node.childNodes) visit(child);
    }
  }
  function apply() {
    document.documentElement.lang=lang;
    document.querySelectorAll("[data-lang]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.lang===lang)));
    visit(document.body);
  }
  window.fatihLanguage = () => lang;
  document.addEventListener("DOMContentLoaded",()=>{
    document.querySelectorAll("[data-lang]").forEach(b=>b.addEventListener("click",()=>{
      lang=b.dataset.lang;
      localStorage.setItem("fatih_portal_lang",lang);
      apply();
    }));
    apply();
    const observer=new MutationObserver(records=>{
      for (const r of records) {
        if (r.type==="characterData") visit(r.target);
        else for (const n of r.addedNodes) visit(n);
      }
    });
    observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  });
})();
