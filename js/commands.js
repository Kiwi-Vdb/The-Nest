const commandSections = document.querySelector("#command-sections");
const commandSearch = document.querySelector("#command-search");
const commandStatus = document.querySelector("#command-status");

let commandCards = [];

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function createCommandCard(command) {
  const card = document.createElement("article");
  card.className = "command-card";

  const usage = createTextElement("code", "command-usage", command.usage);
  const description = createTextElement("p", "command-description", command.description);
  card.append(usage, description);

  if (command.aliases?.length) {
    const aliases = document.createElement("p");
    aliases.className = "command-aliases";
    aliases.append("Also: ");

    command.aliases.forEach((alias, index) => {
      if (index > 0) aliases.append(", ");
      aliases.append(createTextElement("code", "", alias));
    });

    card.append(aliases);
  }

  const searchText = [
    command.usage,
    command.description,
    ...(command.aliases || []),
  ].join(" ").toLowerCase();

  commandCards.push({ card, searchText });
  return card;
}

function renderCommands(data) {
  commandSections.replaceChildren();
  commandCards = [];

  for (const section of data.sections || []) {
    const sectionElement = document.createElement("section");
    sectionElement.className = "command-section";

    const heading = document.createElement("header");
    heading.className = "section-heading";

    const headingCopy = document.createElement("div");
    headingCopy.append(
      createTextElement("h2", "", section.title),
      createTextElement("p", "", section.description),
    );

    const count = createTextElement(
      "span",
      "section-count",
      `${section.commands.length} command${section.commands.length === 1 ? "" : "s"}`,
    );
    heading.append(headingCopy, count);

    const grid = document.createElement("div");
    grid.className = "command-grid";
    section.commands.forEach(command => grid.append(createCommandCard(command)));

    sectionElement.append(heading, grid);
    commandSections.append(sectionElement);
  }

  const total = commandCards.length;
  commandStatus.textContent = `${total} Kiwi Birb commands. Type in the search box to filter the list.`;
}

function filterCommands() {
  const query = commandSearch.value.trim().toLowerCase();
  let visibleCount = 0;

  for (const entry of commandCards) {
    const matches = !query || entry.searchText.includes(query);
    entry.card.hidden = !matches;
    if (matches) visibleCount += 1;
  }

  document.querySelectorAll(".command-section").forEach(section => {
    const sectionVisible = [...section.querySelectorAll(".command-card")]
      .some(card => !card.hidden);
    section.hidden = !sectionVisible;
  });

  if (!query) {
    commandStatus.textContent = `${commandCards.length} Kiwi Birb commands. Type in the search box to filter the list.`;
  } else if (visibleCount === 0) {
    commandStatus.textContent = `No commands match “${commandSearch.value.trim()}”.`;
  } else {
    commandStatus.textContent = `${visibleCount} matching command${visibleCount === 1 ? "" : "s"}.`;
  }
}

async function loadCommands() {
  try {
    const response = await fetch("./data/commands.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Command data returned ${response.status}`);
    renderCommands(await response.json());
  } catch (error) {
    console.error("Could not load Kiwi Birb commands:", error);
    commandStatus.textContent = "The command list is temporarily unavailable. Please try again shortly.";
    commandStatus.classList.add("is-error");
  }
}

commandSearch.addEventListener("input", filterCommands);
loadCommands();
