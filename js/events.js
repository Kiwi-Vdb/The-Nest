async function loadEventsPage() {
  const fallback = {
    upcoming: [
      { date: "FRI", title: "Community Games Night", meta: "8:00 PM · Party games", prize: "+500 Shinies" },
      { date: "SAT", title: "Prediction Night", meta: "Viewer picks and chaos", prize: "+750 Shinies" },
      { date: "SUN", title: "Special Raid Train", meta: "Bring the flock together", prize: "+1,000 Shinies" }
    ],
    current: {
      status: "Active Soon",
      title: "No event running right now",
      description: "The next flock event will appear here when it is ready.",
      prize: "Check back soon ✦"
    },
    calendar: [
      { date: "08", title: "Shiny Hunt Night", meta: "Monster Hunter · 7:30 PM" },
      { date: "10", title: "Community Vote", meta: "Choose next event theme" },
      { date: "12", title: "Giveaway Evening", meta: "Rewards and Shinies" }
    ]
  };

  let data = fallback;
  try {
    const response = await fetch("./data/events.json", { cache: "no-store" });
    if (response.ok) data = await response.json();
  } catch (error) {
    data = fallback;
  }

  renderUpcoming(data.upcoming || fallback.upcoming);
  renderCurrent(data.current || fallback.current);
  renderCalendar(data.calendar || fallback.calendar);
}

function renderUpcoming(items) {
  const target = document.getElementById("events-upcoming-list");
  if (!target) return;

  target.innerHTML = items.slice(0, 3).map(item => `
    <article class="event-row">
      <div class="event-date">${escapeHtml(item.date || "—")}</div>
      <div>
        <div class="event-title">${escapeHtml(item.title || "Upcoming Event")}</div>
        <div class="event-meta">${escapeHtml(item.meta || "Details soon")}</div>
        ${item.prize ? `<div class="event-prize">${escapeHtml(item.prize)}</div>` : ""}
      </div>
    </article>
  `).join("");
}

function renderCurrent(item) {
  const target = document.getElementById("events-current-card");
  if (!target) return;

  target.innerHTML = `
    <div class="current-status">${escapeHtml(item.status || "Upcoming")}</div>
    <div class="current-title">${escapeHtml(item.title || "No event running right now")}</div>
    <div class="current-description">${escapeHtml(item.description || "Event details will appear here.")}</div>
    ${item.prize ? `<div class="current-prize">${escapeHtml(item.prize)}</div>` : ""}
  `;
}

function renderCalendar(items) {
  const target = document.getElementById("events-calendar-list");
  if (!target) return;

  target.innerHTML = items.slice(0, 3).map(item => `
    <article class="calendar-row">
      <div class="calendar-date">${escapeHtml(item.date || "—")}</div>
      <div>
        <div class="calendar-title">${escapeHtml(item.title || "Calendar Event")}</div>
        <div class="calendar-meta">${escapeHtml(item.meta || "Details soon")}</div>
      </div>
    </article>
  `).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadEventsPage();
