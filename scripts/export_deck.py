#!/usr/bin/env python3
"""Build web/deck.js from deck/pilot.toml and the verified-air build.

People write a card's wording in the TOML. Statuses, rule sentences, example
results and dependent counts are read from verified-air, and the export stops
when a card no longer matches them, so the deck cannot drift from the model.

Usage: scripts/export_deck.py [--verified-air ../verified-air] [--check]

--check compares a fresh export with the committed web/deck.js and fails if
they differ.
"""

import argparse
import json
import re
import subprocess
import sys
import tomllib
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://samdengler.github.io/verified-air"
MAX_WORDS = 40
FACE_BANNED = ("reading", "guarantee", "theorem", "lean")
STATUS_WORDS = {"proven": "proven", "example": "example only", "open": "open", "not checked": "not checked"}
FIXED_CHOICES = {
    "confirm": [("no", "No"), ("yes", "Yes")],
    "seeded": [("no", "No"), ("yes", "Yes")],
    "followup": [("no", "No, something else should happen"), ("yes", "Yes, that is right")],
}
KINDS = {"predict", "decide", "confirm", "seeded", "followup", "reconcile"}
# The model's CardKind, as the engines number it.
KIND_CODES = {"predict": 0, "confirm": 1, "decide": 2, "seeded": 3, "followup": 4, "reconcile": 5}
AGREES, DIFFERS = 0, 1


class DeckError(Exception):
    pass


def squash(text):
    return " ".join(text.split())


def sentence(text):
    text = squash(text)
    return text[0].upper() + text[1:] if text else text


def then_of(docstring):
    match = re.search(r"\*\*Then\*\*(.*)", docstring or "", re.S)
    if not match:
        raise DeckError("the example's docstring has no Then")
    return sentence(match.group(1))


def check_face(card_id, *texts):
    """The rules for what a card may show before it is answered."""
    joined = " ".join(t for t in texts if t)
    words = len(joined.split())
    if words > MAX_WORDS:
        raise DeckError(f"{card_id}: {words} words on the card, and the limit is {MAX_WORDS}")
    for word in FACE_BANNED:
        if re.search(rf"\b{word}\b", joined, re.I):
            raise DeckError(f'{card_id}: "{word}" is model vocabulary and stays off the card')


def check_style(card_id, raw):
    for text in strings_in(raw):
        if "\u2014" in text or "\u2013" in text:
            raise DeckError(f"{card_id}: em or en dash in {text!r}")


def strings_in(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from strings_in(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings_in(item)


def require_value(card_id, name, value, needles):
    flat = squash(value or "")
    for needle in needles or []:
        if squash(needle) not in flat:
            raise DeckError(
                f"{card_id}: {name} no longer computes {needle!r}. "
                f"Check the card against the model. The build computes: {flat[:300]}"
            )


class Source:
    """What the exporter reads from verified-air."""

    def __init__(self, decls, nodes, impact, ranking, root=None):
        self.decls = decls
        self.nodes = nodes
        self.impact = impact
        self.ranking = ranking
        self.root = root
        self.criteria = {c["id"]: c for d in decls.values() for c in d.get("criteria") or []}

    def decl(self, card_id, name):
        if name not in self.decls:
            raise DeckError(f"{card_id}: {name} is not in the build")
        return self.decls[name]

    def node_for_lean(self, name):
        return next((n for n in self.nodes if name in (n.get("lean") or [])), None)

    def rule(self, card_id, criterion):
        if criterion not in self.criteria:
            raise DeckError(f"{card_id}: criterion {criterion} is not in the build")
        c = self.criteria[criterion]
        return {"id": criterion, "text": squash(c["ears"]), "status": STATUS_WORDS[c["status"]]}


def link_for(node):
    return f"{SITE}/graph/#{node['label'].replace(':', '%3A')}" if node else f"{SITE}/review/"


def dependents(src, label):
    impact = src.impact(label)
    rank = next((i + 1 for i, r in enumerate(src.ranking) if r["node"]["label"] == label), None)
    return {"count": impact["count"], "areas": impact["areas"], "rank": rank, "ranked": len(src.ranking)}


def build_card(raw, src):
    card_id = raw["id"]
    kind = raw["kind"]
    if kind not in KINDS:
        raise DeckError(f"{card_id}: unknown kind {kind}")
    check_style(card_id, raw)

    say = raw.get("say") or f"{raw['question'].rstrip('?')}, Coach?"
    extras = [f"{f['label']} {f['value']}" for f in raw.get("fields", [])]
    if raw.get("show_today"):
        extras.append(raw.get("today", ""))
    variants = raw.get("variants")
    if variants:
        for key, text in variants.items():
            check_face(card_id, text, say)
            check_face(card_id, raw.get("headlines", {}).get(key, ""))
    else:
        check_face(card_id, raw.get("short") or raw["case"], say, *extras)

    card = {
        "id": card_id,
        "kind": kind,
        "area": raw["area"],
        "label": raw["label"],
        "kindCode": KIND_CODES[kind],
        "question": raw["question"],
        "say": say,
        "behind": {"lean": []},
        "reveal": {},
    }
    if variants:
        card["variants"] = variants
        card["dependsOn"] = raw["depends_on"]
    else:
        card["case"] = raw["case"]

    value = None
    if "example" in raw:
        example = src.decl(card_id, raw["example"])
        if example["kind"] != "case":
            raise DeckError(f"{card_id}: {raw['example']} is not an example")
        value = example.get("value")
        require_value(card_id, raw["example"], value, raw.get("requires"))
        card["behind"]["lean"].append(raw["example"])
        card["behind"]["value"] = value
        if kind == "predict":
            card["reveal"]["then"] = then_of(example["docstring"])

    node = None
    if "criterion" in raw:
        rule = src.rule(card_id, raw["criterion"])
        if kind == "seeded" and rule["status"] != "proven":
            raise DeckError(f"{card_id}: a check card needs a proven rule to change, and {rule['id']} is {rule['status']}")
        card["reveal"]["rule"] = rule
        checked_by = src.criteria[raw["criterion"]].get("checkedBy") or []
        card["behind"]["lean"].extend(n for n in checked_by if n not in card["behind"]["lean"])
        node = next((src.node_for_lean(n) for n in checked_by if src.node_for_lean(n)), None)

    if "open" in raw:
        theorem = src.decl(card_id, raw["open"])
        if theorem["status"] != "open":
            raise DeckError(f"{card_id}: {raw['open']} is {theorem['status']} and the card asks an open question. Retire or rewrite it.")
        card["behind"]["lean"].insert(0, raw["open"])
        node = src.node_for_lean(raw["open"])
        if node:
            card["reveal"]["dependents"] = dependents(src, node["label"])

    if "decision" in raw:
        node = next((n for n in src.nodes if n["label"] == raw["decision"]), None)
        if node is None:
            raise DeckError(f"{card_id}: {raw['decision']} is not in the blueprint")
        if node["status"] != "decision":
            raise DeckError(f"{card_id}: {raw['decision']} is {node['status']} and the card asks for a decision. Retire or rewrite it.")
        card["reveal"]["dependents"] = dependents(src, node["label"])
        card["behind"]["blueprint"] = node["title"]
        if raw.get("top_ranked") and card["reveal"]["dependents"]["rank"] != 1:
            raise DeckError(f"{card_id}: the card says it is first on Decide these first, and it is no longer")
        card["reveal"]["topRanked"] = bool(raw.get("top_ranked"))

    if kind in FIXED_CHOICES:
        card["choices"] = [{"id": i, "label": l} for i, l in FIXED_CHOICES[kind]]
    else:
        card["choices"] = [build_choice(card_id, choice, value, src) for choice in raw["choices"]]
    check_choices(card_id, kind, card["choices"])

    for key, out in (("today", "today"), ("on_yes", "onYes"), ("on_no", "onNo"), ("illustrative", "illustrative"), ("echoes", "echoes")):
        if key in raw:
            card["reveal"][out] = raw[key]

    if "java_file" in raw:
        check_java(card_id, raw, src)
    if "illustrative_detail" in raw:
        card["behind"]["note"] = raw["illustrative_detail"]

    card["behind"]["link"] = link_for(node)
    return card


def build_choice(card_id, raw, value, src):
    choice = {"id": raw["id"], "label": raw["label"]}
    for key in ("model", "consequence"):
        if key in raw:
            choice[key] = raw[key]
    require_value(card_id, f"choice {raw['id']}", value, raw.get("requires"))
    if "proven" in raw:
        theorem = src.decl(card_id, raw["proven"])
        if theorem["status"] != "proven":
            raise DeckError(f"{card_id}: {raw['proven']} is {theorem['status']}, and the card says it is proven")
        choice["proven"] = {"name": raw["proven"], "text": squash(theorem["docstring"])}
    return choice


def check_choices(card_id, kind, choices):
    if kind == "decide" and not 2 <= len(choices) <= 4:
        raise DeckError(f"{card_id}: a decision card offers 2 to 4 choices")
    if kind in ("predict", "reconcile") and len(choices) != 2:
        raise DeckError(f"{card_id}: this card needs exactly two outcomes")
    if kind == "predict" and sum(1 for c in choices if c.get("model")) != 1:
        raise DeckError(f"{card_id}: exactly one choice must be the model's result")


def check_java(card_id, raw, src):
    if src.root is None:
        return
    path = src.root / raw["java_file"]
    if raw["java_contains"] not in path.read_text():
        raise DeckError(f"{card_id}: {raw['java_file']} no longer contains {raw['java_contains']!r}")


def response_of(kind, choice):
    """Which response a choice stands for, in the model's terms."""
    if kind == "predict":
        return AGREES if choice.get("model") else DIFFERS
    if kind in FIXED_CHOICES:
        return AGREES if choice["id"] == "yes" else DIFFERS
    return AGREES


def add_display(card, raw):
    for key in ("short", "fields", "bars", "headlines", "stamps", "show_today"):
        if key in raw:
            card[key] = raw[key]
    for choice in card.get("choices", []):
        choice["response"] = response_of(card["kind"], choice)
        for given in raw.get("choices", []):
            if given.get("id") == choice["id"] and "stamp" in given:
                choice["stamp"] = given["stamp"]


def open_goals(src, names):
    counts = {}
    for node in src.nodes:
        if node.get("status") in ("open", "decision"):
            counts[node.get("section")] = counts.get(node.get("section"), 0) + 1
    sections = {node.get("section") for node in src.nodes}
    areas = []
    for name in names:
        if name not in sections:
            raise DeckError(f"route: {name} is not a section of the model")
        areas.append({"name": name, "openGoals": counts.get(name, 0)})
    return areas


def check_shifts(shifts, cards):
    by_id = {card["id"]: card for card in cards}
    for shift in shifts:
        seen = set()
        for card_id in shift["cards"]:
            if card_id not in by_id:
                raise DeckError(f"{shift['name']}: unknown card {card_id}")
            parent = by_id[card_id].get("dependsOn")
            if parent and parent not in seen:
                raise DeckError(f"{shift['name']}: {card_id} must follow {parent} in the same shift")
            seen.add(card_id)


def build_deck(raw_deck, src, meta):
    cards = []
    ids = set()
    for raw in raw_deck["card"]:
        try:
            card = build_card(raw, src)
            add_display(card, raw)
            cards.append(card)
        except KeyError as missing:
            raise DeckError(f"{raw.get('id', '?')}: missing field {missing}") from missing
        ids.add(raw["id"])
    for card in cards:
        for ref in (card.get("dependsOn"), card["reveal"].get("echoes")):
            if ref and ref not in ids:
                raise DeckError(f"{card['id']}: points at unknown card {ref}")
    shifts = raw_deck.get("shifts", [{"name": "Shift", "cards": [card["id"] for card in cards]}])
    check_shifts(shifts, cards)
    return {
        "title": raw_deck["title"],
        "source": meta,
        "areas": open_goals(src, raw_deck.get("route", [])),
        "shifts": shifts,
        "cards": cards,
    }


def load_source(root):
    status = root / "build" / "status.json"
    if not status.exists():
        sys.exit(f"{status} is missing. Run scripts/build-site.sh in verified-air first.")
    sys.path.insert(0, str(root / "scripts"))
    from graph_model import Model

    model = Model()
    return Source(model.decls, model.nodes, model.impact, model.ranking(), root)


def source_meta(root):
    def git(*args):
        return subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, check=True).stdout.strip()

    status = root / "build" / "status.json"
    built = datetime.fromtimestamp(status.stat().st_mtime, tz=timezone.utc)
    rules_changed = int(git("log", "-1", "--format=%ct", "--", "Rules"))
    if rules_changed > built.timestamp():
        print("warning: Rules changed after the last build, so this export may be stale.", file=sys.stderr)
    return {"repo": "samdengler/verified-air", "commit": git("rev-parse", "--short", "HEAD"), "built": built.strftime("%Y-%m-%d")}


def render(deck):
    body = json.dumps(deck, indent=1, ensure_ascii=False)
    return f"// Generated by scripts/export_deck.py from deck/pilot.toml and the verified-air build. Do not edit.\nwindow.DECK = {body};\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--verified-air", default=str(ROOT.parent / "verified-air"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = Path(args.verified_air).resolve()

    raw_deck = tomllib.loads((ROOT / "deck" / "pilot.toml").read_text())
    try:
        deck = build_deck(raw_deck, load_source(root), source_meta(root))
    except DeckError as err:
        sys.exit(f"deck stopped: {err}")

    out = ROOT / "web" / "deck.js"
    text = render(deck)
    if args.check:
        if not out.exists() or out.read_text() != text:
            sys.exit("web/deck.js is stale. Run scripts/export_deck.py and commit it.")
        print(f"web/deck.js matches the build: {len(deck['cards'])} cards")
        return
    out.write_text(text)
    print(f"wrote {out.relative_to(ROOT)}: {len(deck['cards'])} cards from verified-air {deck['source']['commit']}")


if __name__ == "__main__":
    main()
