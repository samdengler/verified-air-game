"""The exporter stops when a card no longer matches the model."""

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from export_deck import DeckError, Source, build_deck  # noqa: E402

CASE = {
    "name": "Rules.Example.atExpiry",
    "kind": "case",
    "status": "definition",
    "value": "Except.error (Rejection.expired)",
    "docstring": "**Given** an offer.\n\n**When** accepted.\n\n**Then** the offer is rejected.",
    "criteria": [],
}
OPEN = {"name": "Rules.Example.limit", "kind": "theorem", "status": "open", "docstring": "Open.", "criteria": []}
PROVEN = {"name": "Rules.Example.limit_of_x", "kind": "theorem", "status": "proven", "docstring": "Holds for x.", "criteria": []}
RULE = {
    "name": "Rules.Example.rule",
    "kind": "def",
    "status": "definition",
    "docstring": "",
    "criteria": [{"id": "OO-1.1", "status": "proven", "ears": "The system shall reject it.", "checkedBy": ["Rules.Example.atExpiry"]}],
}
DECLS = {d["name"]: d for d in (CASE, OPEN, PROVEN, RULE)}
NODES = [
    {"label": "thm:limit", "title": "Limit", "status": "open", "lean": ["Rules.Example.limit"]},
    {"label": "def:choice", "title": "A choice", "status": "decision", "lean": []},
]
RANKING = [{"node": NODES[1]}, {"node": NODES[0]}]


def impact(label):
    return {"count": 3 if label == "thm:limit" else 9, "areas": ["Payment"]}


def source(decls=None, nodes=None):
    return Source(decls or DECLS, nodes or NODES, impact, RANKING)


def predict(**over):
    card = {
        "id": "p",
        "kind": "predict",
        "area": "Payment",
        "label": "A case",
        "case": "An offer is accepted.",
        "question": "What happens?",
        "example": "Rules.Example.atExpiry",
        "requires": ["Rejection.expired"],
        "criterion": "OO-1.1",
        "choices": [{"id": "a", "label": "Rejected", "model": True}, {"id": "b", "label": "Created"}],
    }
    card.update(over)
    return card


def decide(**over):
    card = {
        "id": "d",
        "kind": "decide",
        "area": "Payment",
        "label": "A decision",
        "case": "A case.",
        "question": "Which?",
        "open": "Rules.Example.limit",
        "choices": [{"id": "a", "label": "A", "proven": "Rules.Example.limit_of_x"}, {"id": "b", "label": "B"}],
    }
    card.update(over)
    return card


def export(*cards, src=None):
    return build_deck({"title": "T", "card": list(cards)}, src or source(), {"commit": "abc"})


class ExportTests(unittest.TestCase):
    def test_a_good_prediction_reads_its_result_and_rule_from_the_build(self):
        card = export(predict())["cards"][0]
        self.assertEqual(card["reveal"]["then"], "The offer is rejected.")
        self.assertEqual(card["reveal"]["rule"], {"id": "OO-1.1", "text": "The system shall reject it.", "status": "proven"})
        self.assertEqual(card["behind"]["value"], CASE["value"])

    def test_a_decision_reads_its_reach_and_proven_version_from_the_build(self):
        card = export(decide())["cards"][0]
        self.assertEqual(card["reveal"]["dependents"]["count"], 3)
        self.assertEqual(card["choices"][0]["proven"]["text"], "Holds for x.")

    def assert_stops(self, pattern, *cards, src=None):
        with self.assertRaisesRegex(DeckError, pattern):
            export(*cards, src=src)

    def test_stops_when_the_computed_value_changes(self):
        self.assert_stops("no longer computes", predict(requires=["Rejection.empty"]))

    def test_stops_when_an_open_question_is_proven(self):
        decls = copy.deepcopy(DECLS)
        decls["Rules.Example.limit"]["status"] = "proven"
        self.assert_stops("asks an open question", decide(), src=source(decls))

    def test_stops_when_a_decision_has_been_taken(self):
        nodes = copy.deepcopy(NODES)
        nodes[1]["status"] = "modelled"
        card = decide(decision="def:choice")
        del card["open"]
        for choice in card["choices"]:
            choice.pop("proven", None)
        self.assert_stops("asks for a decision", card, src=source(nodes=nodes))

    def test_stops_when_a_proven_version_is_not_proven(self):
        decls = copy.deepcopy(DECLS)
        decls["Rules.Example.limit_of_x"]["status"] = "open"
        self.assert_stops("says it is proven", decide(), src=source(decls))

    def test_stops_on_a_missing_name(self):
        self.assert_stops("not in the build", predict(example="Rules.Example.gone"))

    def test_stops_on_a_long_card(self):
        self.assert_stops("the limit is 40", predict(case=" ".join(["word"] * 40)))

    def test_stops_on_model_vocabulary(self):
        self.assert_stops("model vocabulary", predict(case="Under this reading, the offer is accepted."))

    def test_stops_on_a_dash(self):
        self.assert_stops("em or en dash", predict(case="An offer \u2014 accepted."))

    def test_a_prediction_needs_exactly_one_model_result(self):
        self.assert_stops("exactly one choice", predict(choices=[{"id": "a", "label": "A"}, {"id": "b", "label": "B"}]))

    def test_a_check_card_needs_a_proven_rule(self):
        decls = copy.deepcopy(DECLS)
        decls["Rules.Example.rule"]["criteria"][0]["status"] = "open"
        card = {"id": "s", "kind": "seeded", "area": "Payment", "label": "L", "case": "A rule.", "question": "Right?", "criterion": "OO-1.1"}
        self.assert_stops("needs a proven rule", card, src=source(decls))


if __name__ == "__main__":
    unittest.main()
