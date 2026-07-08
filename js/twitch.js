document.addEventListener("DOMContentLoaded", async () => {
  const twitch = await loadJson("./data/twitch.json", {});
  const status = twitch.status || "offline";

  setText("[data-twitch-status]", status === "live" ? "LIVE NOW" : "OFFLINE");
  setText("[data-viewers]", twitch.viewers ?? 0);
  setText("[data-current-game]", twitch.currentGame || "BAR Lobby");
  setText("[data-current-prediction]", twitch.currentPrediction || "No active prediction");

  const dot = document.querySelector("[data-status-dot]");
  if (dot && status !== "live") dot.classList.add("offline");

  const clips = document.querySelector("[data-clips]");
  if (clips && Array.isArray(twitch.clips)) {
    clips.innerHTML = twitch.clips.map(clip => `
      <a class="data-row" href="${clip.url || "#"}">
        <strong>${clip.title || "Untitled clip"}</strong>
        <span>View</span>
      </a>
    `).join("");
  }
});