from __future__ import annotations

import calendar
import json
import os
import re
import webbrowser
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
EVENTS_FILE = ROOT / "data" / "events.json"
DEFAULT_TIME_ZONE = "Europe/London"


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "event"


def last_sunday(year: int, month: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    day = date(year, month, last_day)
    return day - timedelta(days=(day.weekday() + 1) % 7)


def london_offset_fallback(local_value: datetime) -> timezone:
    """Return the UK offset without requiring the optional Windows tzdata package."""
    start_day = last_sunday(local_value.year, 3)
    end_day = last_sunday(local_value.year, 10)

    if local_value.date() < start_day or local_value.date() > end_day:
        return timezone.utc
    if start_day < local_value.date() < end_day:
        return timezone(timedelta(hours=1))

    # UK clocks move forward at 01:00 UTC (02:00 local display) and move back
    # at 02:00 BST. Event times inside the repeated/missing hour are unusual;
    # these boundaries choose the normal post-transition interpretation.
    if local_value.date() == start_day:
        return timezone(timedelta(hours=1)) if local_value.time() >= time(2, 0) else timezone.utc
    return timezone.utc if local_value.time() >= time(2, 0) else timezone(timedelta(hours=1))


def time_zone_for(local_value: datetime, zone_name: str):
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(zone_name)
    except Exception:
        if zone_name == "Europe/London":
            return london_offset_fallback(local_value)
        if zone_name.upper() in {"UTC", "ETC/UTC", "GMT"}:
            return timezone.utc
        # Final fallback uses the PC's local offset. The editor warns the user
        # through the status line when an unsupported zone is entered.
        return local_value.astimezone().tzinfo or timezone.utc


def build_iso(date_text: str, time_text: str, zone_name: str) -> str:
    local_value = datetime.strptime(
        f"{date_text.strip()} {time_text.strip()}",
        "%Y-%m-%d %H:%M",
    )
    aware = local_value.replace(tzinfo=time_zone_for(local_value, zone_name))
    return aware.isoformat(timespec="seconds")


def split_iso(value: str | None) -> tuple[str, str]:
    if not value:
        return "", ""
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed.strftime("%Y-%m-%d"), parsed.strftime("%H:%M")


def load_events_data() -> dict[str, Any]:
    data = load_json(
        EVENTS_FILE,
        {
            "version": 2,
            "sourceTimeZone": DEFAULT_TIME_ZONE,
            "events": [],
        },
    )
    if not isinstance(data, dict):
        raise RuntimeError("events.json must contain a JSON object.")
    if not isinstance(data.get("events"), list):
        raise RuntimeError(
            "This editor requires the version 2 events.json format with one events list."
        )
    data.setdefault("version", 2)
    data.setdefault("sourceTimeZone", DEFAULT_TIME_ZONE)
    return data


def launch_gui() -> int:
    try:
        import tkinter as tk
        from tkinter import messagebox, ttk
    except Exception as error:
        print(f"Tkinter is unavailable: {error}")
        return 1

    data = load_events_data()
    events: list[dict[str, Any]] = data["events"]

    root = tk.Tk()
    root.title("The Nest Event Manager")
    root.geometry("1180x760")
    root.minsize(1020, 680)

    style = ttk.Style(root)
    if "vista" in style.theme_names():
        style.theme_use("vista")

    outer = ttk.Frame(root, padding=12)
    outer.pack(fill="both", expand=True)
    outer.columnconfigure(0, weight=3)
    outer.columnconfigure(1, weight=2)
    outer.rowconfigure(1, weight=1)

    ttk.Label(
        outer,
        text="The Nest Events",
        font=("Segoe UI", 17, "bold"),
    ).grid(row=0, column=0, sticky="w", pady=(0, 8))

    ttk.Label(
        outer,
        text=(
            "Add or remove an event once. The website automatically fills "
            "Upcoming, Current and Calendar, and converts every time for each visitor."
        ),
        wraplength=500,
        justify="right",
    ).grid(row=0, column=1, sticky="e", pady=(0, 8))

    columns = ("start", "end", "category", "location")
    tree = ttk.Treeview(
        outer,
        columns=columns,
        show="tree headings",
        selectmode="browse",
    )
    tree.heading("#0", text="Event")
    tree.heading("start", text="Starts (host time)")
    tree.heading("end", text="Ends")
    tree.heading("category", text="Category")
    tree.heading("location", text="Location")
    tree.column("#0", width=230, minwidth=180)
    tree.column("start", width=145)
    tree.column("end", width=120)
    tree.column("category", width=95)
    tree.column("location", width=125)
    tree.grid(row=1, column=0, sticky="nsew", padx=(0, 12))

    scroll = ttk.Scrollbar(outer, orient="vertical", command=tree.yview)
    tree.configure(yscrollcommand=scroll.set)
    scroll.grid(row=1, column=0, sticky="nse", padx=(0, 12))

    editor = ttk.LabelFrame(outer, text="Selected Event", padding=12)
    editor.grid(row=1, column=1, sticky="nsew")
    editor.columnconfigure(1, weight=1)

    vars_: dict[str, tk.Variable] = {
        "title": tk.StringVar(),
        "category": tk.StringVar(value="Community"),
        "startDate": tk.StringVar(),
        "startTime": tk.StringVar(value="19:00"),
        "endDate": tk.StringVar(),
        "endTime": tk.StringVar(),
        "timeZone": tk.StringVar(value=data.get("sourceTimeZone") or DEFAULT_TIME_ZONE),
        "location": tk.StringVar(value="The Nest"),
        "link": tk.StringVar(),
        "linkLabel": tk.StringVar(value="Event details"),
        "durationHours": tk.StringVar(value="8"),
        "description": tk.StringVar(),
    }

    def add_entry(row: int, label: str, variable: tk.Variable, **kwargs) -> ttk.Entry:
        ttk.Label(editor, text=label).grid(
            row=row, column=0, sticky="w", padx=(0, 10), pady=4
        )
        entry = ttk.Entry(editor, textvariable=variable, **kwargs)
        entry.grid(row=row, column=1, sticky="ew", pady=4)
        return entry

    add_entry(0, "Title", vars_["title"])
    category = ttk.Combobox(
        editor,
        textvariable=vars_["category"],
        values=("Community", "Tournament", "Birthday", "Giveaway", "Stream", "Special"),
    )
    ttk.Label(editor, text="Category").grid(row=1, column=0, sticky="w", padx=(0, 10), pady=4)
    category.grid(row=1, column=1, sticky="ew", pady=4)

    date_frame = ttk.Frame(editor)
    date_frame.columnconfigure(0, weight=1)
    date_frame.columnconfigure(1, weight=1)
    ttk.Entry(date_frame, textvariable=vars_["startDate"]).grid(row=0, column=0, sticky="ew", padx=(0, 5))
    ttk.Entry(date_frame, textvariable=vars_["startTime"]).grid(row=0, column=1, sticky="ew", padx=(5, 0))
    ttk.Label(editor, text="Start (YYYY-MM-DD / HH:MM)").grid(row=2, column=0, sticky="w", padx=(0, 10), pady=4)
    date_frame.grid(row=2, column=1, sticky="ew", pady=4)

    end_frame = ttk.Frame(editor)
    end_frame.columnconfigure(0, weight=1)
    end_frame.columnconfigure(1, weight=1)
    ttk.Entry(end_frame, textvariable=vars_["endDate"]).grid(row=0, column=0, sticky="ew", padx=(0, 5))
    ttk.Entry(end_frame, textvariable=vars_["endTime"]).grid(row=0, column=1, sticky="ew", padx=(5, 0))
    ttk.Label(editor, text="End (optional date / time)").grid(row=3, column=0, sticky="w", padx=(0, 10), pady=4)
    end_frame.grid(row=3, column=1, sticky="ew", pady=4)

    add_entry(4, "Duration hours (used if no end)", vars_["durationHours"])
    add_entry(5, "Host time zone", vars_["timeZone"])
    add_entry(6, "Location", vars_["location"])
    add_entry(7, "Website link (optional)", vars_["link"])
    add_entry(8, "Link label", vars_["linkLabel"])

    ttk.Label(editor, text="Description").grid(
        row=9, column=0, sticky="nw", padx=(0, 10), pady=4
    )
    description = tk.Text(editor, height=6, wrap="word")
    description.grid(row=9, column=1, sticky="nsew", pady=4)
    editor.rowconfigure(9, weight=1)

    status = tk.StringVar(
        value="Times are stored with an explicit offset and displayed in each visitor's local time."
    )
    ttk.Label(
        editor,
        textvariable=status,
        wraplength=430,
    ).grid(row=13, column=0, columnspan=2, sticky="ew", pady=(12, 0))

    current_index: int | None = None

    def event_sort_key(event: dict[str, Any]) -> str:
        return str(event.get("start") or "9999")

    def sort_events() -> None:
        events.sort(key=event_sort_key)

    def tree_values(event: dict[str, Any]) -> tuple[str, str, str, str]:
        start_date, start_time = split_iso(event.get("start"))
        end_date, end_time = split_iso(event.get("end"))
        start = f"{start_date} {start_time}".strip()
        end = f"{end_date} {end_time}".strip()
        return (
            start,
            end or "—",
            str(event.get("category") or "Community"),
            str(event.get("location") or ""),
        )

    def refresh_tree(select_id: str | None = None) -> None:
        tree.delete(*tree.get_children())
        for index, event in enumerate(events):
            tree.insert(
                "",
                "end",
                iid=str(index),
                text=str(event.get("title") or "Untitled event"),
                values=tree_values(event),
            )
        if select_id:
            for index, event in enumerate(events):
                if event.get("id") == select_id:
                    tree.selection_set(str(index))
                    tree.focus(str(index))
                    tree.see(str(index))
                    break

    def clear_form() -> None:
        nonlocal current_index
        current_index = None
        next_week = date.today() + timedelta(days=7)
        vars_["title"].set("")
        vars_["category"].set("Community")
        vars_["startDate"].set(next_week.isoformat())
        vars_["startTime"].set("19:00")
        vars_["endDate"].set("")
        vars_["endTime"].set("")
        vars_["durationHours"].set("8")
        vars_["timeZone"].set(str(data.get("sourceTimeZone") or DEFAULT_TIME_ZONE))
        vars_["location"].set("The Nest")
        vars_["link"].set("")
        vars_["linkLabel"].set("Event details")
        vars_["description"].set("")
        description.delete("1.0", "end")
        tree.selection_remove(tree.selection())
        status.set("Creating a new event.")

    def load_selected(_event=None) -> None:
        nonlocal current_index
        selection = tree.selection()
        if not selection:
            return
        current_index = int(selection[0])
        event = events[current_index]
        start_date, start_time = split_iso(event.get("start"))
        end_date, end_time = split_iso(event.get("end"))

        vars_["title"].set(str(event.get("title") or ""))
        vars_["category"].set(str(event.get("category") or "Community"))
        vars_["startDate"].set(start_date)
        vars_["startTime"].set(start_time)
        vars_["endDate"].set(end_date)
        vars_["endTime"].set(end_time)
        vars_["durationHours"].set(str(round(float(event.get("durationMinutes") or 480) / 60, 2)).rstrip("0").rstrip("."))
        vars_["timeZone"].set(str(event.get("timeZone") or DEFAULT_TIME_ZONE))
        vars_["location"].set(str(event.get("location") or ""))
        vars_["link"].set(str(event.get("link") or ""))
        vars_["linkLabel"].set(str(event.get("linkLabel") or "Event details"))
        vars_["description"].set(str(event.get("description") or ""))
        description.delete("1.0", "end")
        description.insert("1.0", str(event.get("description") or ""))
        status.set(f"Editing {event.get('title', 'event')}.")

    def unique_id(title: str, start_iso: str, existing_id: str | None = None) -> str:
        year = datetime.fromisoformat(start_iso).year
        base = f"{slugify(title)}-{year}"
        used = {str(item.get("id")) for item in events if item.get("id") != existing_id}
        candidate = base
        suffix = 2
        while candidate in used:
            candidate = f"{base}-{suffix}"
            suffix += 1
        return existing_id or candidate

    def write_events_file(message: str) -> None:
        sort_events()
        data["version"] = 2
        data["sourceTimeZone"] = str(data.get("sourceTimeZone") or DEFAULT_TIME_ZONE)
        data["updatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        save_json(EVENTS_FILE, data)
        status.set(message)

    def save_event() -> None:
        nonlocal current_index
        title = vars_["title"].get().strip()
        start_date = vars_["startDate"].get().strip()
        start_time = vars_["startTime"].get().strip()
        end_date = vars_["endDate"].get().strip()
        end_time = vars_["endTime"].get().strip()
        zone_name = vars_["timeZone"].get().strip() or DEFAULT_TIME_ZONE
        try:
            duration_minutes = max(15, int(float(vars_["durationHours"].get().strip() or "8") * 60))
        except ValueError:
            messagebox.showerror("Invalid duration", "Duration hours must be a number, such as 8 or 2.5.")
            return

        if not title:
            messagebox.showerror("Missing title", "Please enter an event title.")
            return

        try:
            start_iso = build_iso(start_date, start_time, zone_name)
            end_iso = None
            if end_date or end_time:
                if not end_date:
                    end_date = start_date
                if not end_time:
                    messagebox.showerror(
                        "Missing end time",
                        "Enter an end time, or leave both end fields blank.",
                    )
                    return
                end_iso = build_iso(end_date, end_time, zone_name)
                if datetime.fromisoformat(end_iso) <= datetime.fromisoformat(start_iso):
                    messagebox.showerror(
                        "Invalid end time",
                        "The event end must be after its start.",
                    )
                    return
        except ValueError:
            messagebox.showerror(
                "Invalid date or time",
                "Use YYYY-MM-DD for dates and HH:MM in 24-hour time.",
            )
            return

        existing_id = (
            str(events[current_index].get("id"))
            if current_index is not None and 0 <= current_index < len(events)
            else None
        )

        link = vars_["link"].get().strip()
        if link and not link.startswith("https://"):
            messagebox.showerror(
                "Invalid link",
                "Public event links must begin with https://",
            )
            return

        event_record = {
            "id": unique_id(title, start_iso, existing_id),
            "title": title,
            "category": vars_["category"].get().strip() or "Community",
            "start": start_iso,
            "end": end_iso,
            "durationMinutes": duration_minutes,
            "timeZone": zone_name,
            "location": vars_["location"].get().strip(),
            "description": description.get("1.0", "end").strip(),
            "link": link,
            "linkLabel": vars_["linkLabel"].get().strip() or "Event details",
        }

        if current_index is None:
            events.append(event_record)
        else:
            events[current_index] = event_record

        write_events_file(f"Saved {title} to data/events.json.")
        refresh_tree(event_record["id"])
        current_index = next(
            (i for i, item in enumerate(events) if item.get("id") == event_record["id"]),
            None,
        )

    def remove_event() -> None:
        nonlocal current_index
        if current_index is None or not (0 <= current_index < len(events)):
            messagebox.showinfo("Select an event", "Select the event you want to remove.")
            return
        title = str(events[current_index].get("title") or "this event")
        if not messagebox.askyesno(
            "Remove event",
            f"Remove {title} from every Events-page panel?",
        ):
            return
        events.pop(current_index)
        current_index = None
        write_events_file(f"Removed {title}.")
        refresh_tree()
        clear_form()

    def open_json() -> None:
        try:
            os.startfile(EVENTS_FILE)  # type: ignore[attr-defined]
        except Exception:
            webbrowser.open(EVENTS_FILE.as_uri())

    def open_preview() -> None:
        webbrowser.open("http://127.0.0.1:8765/events.html")

    buttons = ttk.Frame(editor)
    buttons.grid(row=11, column=0, columnspan=2, sticky="ew", pady=(14, 0))
    for column in range(4):
        buttons.columnconfigure(column, weight=1)

    ttk.Button(buttons, text="Add New", command=clear_form).grid(
        row=0, column=0, sticky="ew", padx=(0, 4)
    )
    ttk.Button(buttons, text="Save Event", command=save_event).grid(
        row=0, column=1, sticky="ew", padx=4
    )
    ttk.Button(buttons, text="Remove Event", command=remove_event).grid(
        row=0, column=2, sticky="ew", padx=4
    )
    ttk.Button(buttons, text="Open JSON", command=open_json).grid(
        row=0, column=3, sticky="ew", padx=(4, 0)
    )
    ttk.Button(
        buttons,
        text="Open Local Preview",
        command=open_preview,
    ).grid(row=1, column=0, columnspan=4, sticky="ew", pady=(8, 0))

    tree.bind("<<TreeviewSelect>>", load_selected)

    sort_events()
    refresh_tree()
    if events:
        tree.selection_set("0")
        tree.focus("0")
        load_selected()
    else:
        clear_form()

    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(launch_gui())
