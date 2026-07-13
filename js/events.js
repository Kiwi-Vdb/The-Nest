const EVENTS_REFRESH_MS = 60_000;
const EVENTS_CLOCK_MS = 30_000;

const fallbackEventsData = {
  version: 2,
  sourceTimeZone: "Europe/London",
  events: []
};

let currentEventsData = fallbackEventsData;

async function readEventsData() {
  try {
    const response = await fetch(`./data/events.json?v=${Date.now()}`, {
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`Unable to load events.json (${response.status})`);
    const data = await response.json();
    return normaliseEventsData(data);
  } catch (error) {
    console.warn("The Nest Events: using the last available event data.", error);
    return currentEventsData;
  }
}

function normaliseEventsData(data = {}) {
  if (Array.isArray(data.events)) {
    return {
      version: Number(data.version) || 2,
      sourceTimeZone: String(data.sourceTimeZone || "Europe/London"),
      updatedAt: String(data.updatedAt || ""),
      events: data.events
        .map(normaliseEvent)
        .filter(event => event.title && event.startDate)
        .sort((a, b) => a.startDate - b.startDate)
    };
  }

  // Legacy page data is accepted as a safe empty state. The new editor always
  // writes the version 2 single-list format.
  return {
    ...fallbackEventsData,
    events: []
  };
}

function normaliseEvent(item = {}) {
  const startDate = parseEventDate(item.start);
  const endDate = parseEventDate(item.end);

  return {
    id: String(item.id || slugify(item.title || "event")),
    title: String(item.title || "Untitled event").trim(),
    category: String(item.category || "Community").trim(),
    start: String(item.start || ""),
    end: item.end ? String(item.end) : "",
    startDate,
    endDate,
    durationMinutes: Math.max(15, Math.trunc(Number(item.durationMinutes) || 480)),
    timeZone: String(item.timeZone || currentEventsData.sourceTimeZone || "Europe/London"),
    location: String(item.location || "").trim(),
    description: String(item.description || "").trim(),
    link: safeExternalUrl(item.link),
    linkLabel: String(item.linkLabel || "Event details").trim()
  };
}

function parseEventDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeExternalUrl(value) {
  const url = String(value || "").trim();
  return /^https:\/\//i.test(url) ? url : "";
}

function visitorTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";
  } catch {
    return "Local time";
  }
}

function formatDate(date, options) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Date to be confirmed";
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function sameLocalDay(a, b) {
  if (!a || !b) return false;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(a) === formatter.format(b);
}

function formatEventRange(event, compact = false) {
  const start = event.startDate;
  const end = event.endDate;

  if (!start) return "Date to be confirmed";

  const dateText = formatDate(start, compact
    ? { weekday: "short", day: "numeric", month: "short" }
    : { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const startTime = formatDate(start, {
    hour: "2-digit",
    minute: "2-digit"
  });

  const zoneName = formatDate(start, {
    timeZoneName: "short"
  }).replace(/^.*\s/, "");

  if (!end) {
    return `${dateText} · ${startTime} ${zoneName}`;
  }

  const endTime = formatDate(end, {
    hour: "2-digit",
    minute: "2-digit"
  });

  if (sameLocalDay(start, end)) {
    return `${dateText} · ${startTime}–${endTime} ${zoneName}`;
  }

  const endDate = formatDate(end, {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
  return `${dateText}, ${startTime} – ${endDate}, ${endTime} ${zoneName}`;
}

function effectiveEndDate(event) {
  if (event.endDate) return event.endDate;
  if (!event.startDate) return null;
  return new Date(event.startDate.getTime() + event.durationMinutes * 60_000);
}

function eventState(event, now = new Date()) {
  if (!event.startDate) return "unknown";
  if (event.startDate > now) return "upcoming";
  const end = effectiveEndDate(event);
  if (end && end >= now) return "current";
  return "past";
}

function futureEvents(events, now = new Date()) {
  return events.filter(event => {
    const state = eventState(event, now);
    return state === "current" || state === "upcoming";
  });
}

function relativeStart(event, now = new Date()) {
  if (!event.startDate) return "Date to be confirmed";

  const diffMs = event.startDate - now;
  if (diffMs <= 0 && effectiveEndDate(event) >= now) return "Happening now";

  const absMs = Math.abs(diffMs);
  let value;
  let unit;

  if (absMs >= 86_400_000) {
    value = Math.round(diffMs / 86_400_000);
    unit = "day";
  } else if (absMs >= 3_600_000) {
    value = Math.round(diffMs / 3_600_000);
    unit = "hour";
  } else {
    value = Math.max(1, Math.round(diffMs / 60_000));
    unit = "minute";
  }

  try {
    return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(value, unit);
  } catch {
    return `Starts ${formatEventRange(event, true)}`;
  }
}

function eventBadge(event) {
  if (!event.startDate) return { top: "TBC", bottom: "" };
  return {
    top: formatDate(event.startDate, { day: "2-digit" }),
    bottom: formatDate(event.startDate, { month: "short" }).toUpperCase()
  };
}

function eventLinkHtml(event, className = "event-link") {
  if (!event.link) return "";
  return `<a class="${className}" href="${escapeHtml(event.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(event.linkLabel || "Event details")} ↗</a>`;
}

function renderUpcoming(events, now = new Date()) {
  const target = document.getElementById("events-upcoming-list");
  if (!target) return;

  const items = events
    .filter(event => eventState(event, now) === "upcoming")
    .slice(0, 3);

  if (!items.length) {
    target.innerHTML = `<div class="event-empty">No more events are scheduled yet.</div>`;
    return;
  }

  target.innerHTML = items.map(event => {
    const badge = eventBadge(event);
    return `
      <article class="event-row">
        <div class="event-date" aria-hidden="true">
          <strong>${escapeHtml(badge.top)}</strong>
          <span>${escapeHtml(badge.bottom)}</span>
        </div>
        <div class="event-copy">
          <div class="event-title">${escapeHtml(event.title)}</div>
          <div class="event-meta">${escapeHtml(formatEventRange(event, true))}</div>
          <div class="event-submeta">${escapeHtml([event.category, event.location].filter(Boolean).join(" · "))}</div>
          ${eventLinkHtml(event)}
        </div>
      </article>`;
  }).join("");
}

function renderCurrent(events, now = new Date()) {
  const target = document.getElementById("events-current-card");
  if (!target) return;

  const active = events.find(event => eventState(event, now) === "current");
  const next = events.find(event => eventState(event, now) === "upcoming");
  const event = active || next;

  if (!event) {
    target.innerHTML = `
      <div class="current-status is-waiting">Nothing scheduled</div>
      <div class="current-title">The calendar is clear</div>
      <div class="current-description">Use Edit Events.bat to add the next flock event.</div>
      <div class="current-local-time">Times will appear in each visitor's local time.</div>`;
    return;
  }

  const isActive = Boolean(active);
  target.innerHTML = `
    <div class="current-status ${isActive ? "is-live" : "is-upcoming"}">${isActive ? "Happening Now" : "Next Event"}</div>
    <div class="current-title">${escapeHtml(event.title)}</div>
    <div class="current-meta">${escapeHtml(formatEventRange(event))}</div>
    <div class="current-countdown">${escapeHtml(relativeStart(event, now))}</div>
    <div class="current-description">${escapeHtml(event.description || "More details will be shared soon.")}</div>
    <div class="current-local-time">Shown in ${escapeHtml(visitorTimeZone())}</div>
    ${eventLinkHtml(event, "current-link")}`;
}

function renderCalendar(events, now = new Date()) {
  const target = document.getElementById("events-calendar-list");
  if (!target) return;

  const items = futureEvents(events, now).slice(0, 4);

  if (!items.length) {
    target.innerHTML = `<div class="event-empty">No calendar entries yet.</div>`;
    return;
  }

  target.innerHTML = items.map(event => {
    const badge = eventBadge(event);
    const state = eventState(event, now);
    return `
      <article class="calendar-row ${state === "current" ? "is-current-event" : ""}">
        <div class="calendar-date" aria-hidden="true">
          <strong>${escapeHtml(badge.top)}</strong>
          <span>${escapeHtml(badge.bottom)}</span>
        </div>
        <div class="calendar-copy">
          <div class="calendar-title">${escapeHtml(event.title)}</div>
          <div class="calendar-meta">${escapeHtml(formatEventRange(event, true))}</div>
          ${event.link ? eventLinkHtml(event, "calendar-link") : ""}
        </div>
      </article>`;
  }).join("");
}

function renderEventsPage(data = currentEventsData) {
  const events = Array.isArray(data.events) ? data.events : [];
  const now = new Date();
  renderUpcoming(events, now);
  renderCurrent(events, now);
  renderCalendar(events, now);
}

async function refreshEvents() {
  currentEventsData = await readEventsData();
  renderEventsPage(currentEventsData);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function initEventsPage() {
  await refreshEvents();
  window.setInterval(refreshEvents, EVENTS_REFRESH_MS);
  window.setInterval(() => renderEventsPage(currentEventsData), EVENTS_CLOCK_MS);
}

initEventsPage();
