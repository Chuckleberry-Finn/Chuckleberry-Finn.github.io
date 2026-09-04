const CONFIG = {
  defaultOwner: "Chuckleberry-Finn",

  hub: {
    title: "Translation Tool",
    subtitle: "Help translate Project Zomboid mods (Build 42+)",
  },

  // Leave empty to disable Steam login / PR submission (download-only mode still works without it).
  worker: {
    url: "https://steam-issue-tracker.chuckleberryfinn.workers.dev",
  },

  modsJsonPath: "../mods.json",
  languagesJsonPath: "languages.json",
  defaultSourceLang: "EN",
  translateFolderName: "Translate",
  allowedExtensions: [".json"],
};
