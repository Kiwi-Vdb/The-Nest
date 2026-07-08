document.addEventListener("DOMContentLoaded", async () => {
  const data = await loadJson("./data/twitch.json", {});
  const status = data.status === "live" ? "LIVE NOW" : "OFFLINE";

  setText("[data-live-status]", status);
  setText("[data-viewers]", data.viewers ?? 0);
  setText("[data-game]", data.currentGame || "BAR Lobby");

  const dot = document.querySelector("[data-live-dot]");
  if (dot && data.status !== "live") dot.classList.add("offline");

  const pred = data.currentPrediction || {};
  setText("[data-prediction]", pred.question || "No current prediction");
  setText("[data-pred-yes]", `${pred.yes ?? 0}%`);
  setText("[data-pred-no]", `${pred.no ?? 0}%`);
  setText("[data-prize]", `${pred.prize ?? 0} Shinies`);

  const clips = document.querySelector("[data-clips]");
  if (clips && Array.isArray(data.clips)) {
    clips.innerHTML = data.clips.map(clip => `
      <article class="tile">
        <div class="tile-thumb"></div>
        <strong>${clip.title}</strong>
        <p>${clip.time}</p>
      </article>
    `).join("");
  }
});