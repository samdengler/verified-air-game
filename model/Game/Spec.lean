import Game.Session
import Game.Outcome
import Game.Standing
import Game.Streak
import Game.Crew
import Game.Evidence
import Game.Engine

/-! # The requirement specs, as values of the model

`lake exe specs` writes `.kiro/specs` from this file and nothing else. No docstring
is read. Tables are computed by running the model's own functions, so changing a rule
or a constant changes the spec. A guarantee names a theorem with a checked name: the
generator reads its statement and its axioms from the compiled model, and stops if it
is missing or rests on `sorry`. Words such as `Phase.phrase` match on every constructor,
so a new screen or event stops the build until it has words. -/

namespace Game.Spec

open Game
open Lean (Name)

inductive Ears where
  | always (shall : String)
  | whenever (trigger shall : String)
  | during (state shall : String)
  | duringWhen (state trigger shall : String)
  | unwanted (condition shall : String)

def Ears.render : Ears → String
  | .always shall => s!"THE SYSTEM SHALL {shall}."
  | .whenever trigger shall => s!"WHEN {trigger} THE SYSTEM SHALL {shall}."
  | .during state shall => s!"WHILE {state} THE SYSTEM SHALL {shall}."
  | .duringWhen state trigger shall => s!"WHILE {state}, WHEN {trigger} THE SYSTEM SHALL {shall}."
  | .unwanted condition shall => s!"IF {condition} THEN THE SYSTEM SHALL {shall}."

/-- Where a criterion comes from. -/
inductive Basis where
  /-- Computed by running this definition of the model. -/
  | modelled (source : Name)
  /-- Stated and proved for every input by this theorem. -/
  | proven (thm : Name)
  /-- This theorem shows the current design has a problem, this one shows a way out,
  and someone has to decide. -/
  | openQuestion (problem proposal : Name)

structure Criterion where
  ears : Ears
  basis : Basis

structure Requirement where
  id : String
  title : String
  story : String
  criteria : List Criterion

/-- A function every engine implements. -/
structure EngineFn where
  wire : String
  source : Name

structure SpecFile where
  folder : String
  title : String
  intro : String
  types : List Name
  requirements : List Requirement
  engine : List EngineFn := []
  stateTable : Bool := false

/-! ## Words for the model's values -/

def phasePhrase : Phase → String
  | .intro => "the shift intro is showing"
  | .asking => "a case is showing"
  | .revealed => "a result is showing"
  | .done => "the shift report is showing"

def phaseName : Phase → String
  | .intro => "Intro" | .asking => "Case" | .revealed => "Result" | .done => "Report"

def eventPhrase : Event → String
  | .start => "the expert starts the shift"
  | .call => "the expert makes a call on the case"
  | .depends => "the expert says it depends"
  | .notMine => "the expert says it is not their area"
  | .next => "the expert moves on"

def eventName : Event → String
  | .start => "Start" | .call => "Call" | .depends => "It depends"
  | .notMine => "Not my area" | .next => "Next"

def kindPhrase : CardKind → String
  | .predict => "a prediction card"
  | .confirm => "a confirmation card"
  | .decide => "a decision card"
  | .check => "a check card, which holds a rule changed to be wrong"
  | .followUp => "a follow-up card, computed from the last answer"
  | .reconcile => "a card that compares the rules with the code"

def responsePhrase : Response → String
  | .agrees => "the expert agrees with the rulebook"
  | .differs => "the expert disagrees with the rulebook"
  | .depends => "the expert says it depends"
  | .notMine => "the expert says it is not their area"

def outcomePhrase : Outcome → String
  | .sameCall => "record a same call"
  | .possibleCatch => "tag a possible catch for the area owner"
  | .exception => "record an exception for the area owner"
  | .decisionSent => "send the decision to the area owner"
  | .checkPassed => "record a passed check card"
  | .checkMissed => "record a missed check card and say nothing about it"
  | .routed => "route the case to its owner and show no result"

def outcomeName : Outcome → String
  | .sameCall => "same call"
  | .possibleCatch => "possible catch"
  | .exception => "exception"
  | .decisionSent => "decision sent"
  | .checkPassed => "passed check"
  | .checkMissed => "missed check"
  | .routed => "routed"

def titleName : Title → String
  | .shiftLead => "Shift lead" | .dutyManager => "Duty manager" | .stationManager => "Station manager"

/-! ## Tables computed from the model -/

/-- What moving from one session to the next looks like on screen. -/
def effectOf (s t : Session) : String :=
  match t.phase with
  | .intro => "show the intro"
  | .revealed => "show the result of the case"
  | .asking => if t.index == s.index then "show the first case" else "show the next case"
  | .done => "show the shift report"

/-- A session to try each event on, with what makes it different. -/
def samples : Phase → List (Session × String)
  | .intro => [(⟨.intro, 0, shiftLimit⟩, "the shift has cases"), (⟨.intro, 0, 0⟩, "the shift has no cases")]
  | .asking => [(⟨.asking, 0, shiftLimit⟩, "more cases remain"), (⟨.asking, shiftLimit - 1, shiftLimit⟩, "it is the last case")]
  | .revealed => [(⟨.revealed, 0, shiftLimit⟩, "more cases remain"), (⟨.revealed, shiftLimit - 1, shiftLimit⟩, "it is the last case")]
  | .done => [(⟨.done, shiftLimit - 1, shiftLimit⟩, "the shift is over")]

def effects (p : Phase) (e : Event) : List (String × String) :=
  (samples p).filterMap fun (s, why) => (s.step e).map fun t => (why, effectOf s t)

/-- One criterion per thing an event does on a screen, read from `Session.step`. -/
def stepCriteria : List Criterion :=
  Phase.all.flatMap fun p =>
    let moves := Event.all.flatMap fun e =>
      match effects p e with
      | [] => []
      | rows =>
        if (rows.map (·.2)).eraseDups.length == 1 then
          [{ ears := .duringWhen (phasePhrase p) (eventPhrase e) (rows.head!.2)
             basis := .modelled ``Session.step : Criterion }]
        else
          rows.map fun (why, effect) =>
            { ears := .duringWhen (s!"{phasePhrase p} and {why}") (eventPhrase e) effect
              basis := .modelled ``Session.step : Criterion }
    let refused := Event.all.filter fun e => (effects p e).isEmpty
    let refusals : List Criterion :=
      if refused.isEmpty then []
      else
        [{ ears := .during (phasePhrase p)
             s!"do nothing on {", ".intercalate (refused.map eventName)}"
           basis := .modelled ``Session.step }]
    moves ++ refusals

/-- One criterion per response, and one per kind of card where the kinds differ. -/
def judgeCriteria : List Criterion :=
  Response.all.flatMap fun r =>
    let rows := CardKind.all.map fun k => (k, judge k r)
    if (rows.map (·.2)).eraseDups.length == 1 then
      [{ ears := .whenever (responsePhrase r) (outcomePhrase rows.head!.2)
         basis := .modelled ``judge }]
    else
      rows.map fun (k, o) =>
        { ears := .whenever s!"{responsePhrase r} on {kindPhrase k}" (outcomePhrase o)
          basis := .modelled ``judge }

def loudnessCriteria : List Criterion :=
  Outcome.all.map fun o =>
    { ears := .whenever s!"the outcome is a {outcomeName o}"
        s!"make a moment of size {o.loudness} out of 3"
      basis := .modelled ``Outcome.loudness }

/-- The bars read from the model, so a changed bar changes the sentence. -/
def titleCriteria : List Criterion :=
  [ { ears := .whenever
        s!"a person has at least {stationManagerBar} upheld catches and {stationManagerBar} passed check cards"
        s!"give the title {titleName (Standing.title ⟨0, stationManagerBar, stationManagerBar⟩)}"
      basis := .modelled ``Standing.title },
    { ears := .whenever
        s!"a person has at least {dutyManagerBar} upheld catches and {dutyManagerBar} passed check cards, and has not reached the next bar"
        s!"give the title {titleName (Standing.title ⟨0, dutyManagerBar, dutyManagerBar⟩)}"
      basis := .modelled ``Standing.title },
    { ears := .whenever
        s!"a person has fewer than {dutyManagerBar} upheld catches or fewer than {dutyManagerBar} passed check cards"
        s!"give the title {titleName (Standing.title ⟨0, dutyManagerBar - 1, dutyManagerBar⟩)}"
      basis := .modelled ``Standing.title } ]

/-! ## The specs -/

def shift : SpecFile :=
  { folder := "review-game-shift"
    title := "A shift of review cases"
    intro := "One expert moves through a short run of cases. These requirements describe every screen and every action."
    types := [``Phase, ``Event, ``Session, ``Screen]
    stateTable := true
    engine := [⟨"session_step(phase, index, length, event)", ``Engine.sessionStep⟩,
      ⟨"shift_length(cases)", ``Engine.shiftLength⟩]
    requirements :=
      [ { id := "RG-001"
          title := "Moving through a shift"
          story := "As an expert, I want each action to do one clear thing, so that I can answer without reading instructions."
          criteria := stepCriteria },
        { id := "RG-002"
          title := "What every shift guarantees"
          story := "As an expert, I want a short shift that can always finish and never shows me the answer first, so that a review costs little and my call is my own."
          criteria :=
            [ { ears := .always s!"cut a shift to at most {shiftLimit} cases"
                basis := .proven ``new_respects_limit },
              { ears := .during "a case is showing" "offer both It depends and Not my area"
                basis := .proven ``escapes_always_work },
              { ears := .during "a case is showing" "show nothing that depends on the case's outcome"
                basis := .proven ``face_hides_outcome },
              { ears := .always "offer a way forward on every screen except the report"
                basis := .proven ``no_dead_ends },
              { ears := .always "let every shift reach the report"
                basis := .proven ``every_shift_finishes },
              { ears := .always "move closer to the report with every step, so no shift can loop"
                basis := .proven ``step_reduces_remaining } ] } ] }

def answers : SpecFile :=
  { folder := "review-game-answers"
    title := "What an answer means"
    intro := "How each response on each kind of card is recorded, and how big a moment the screen makes of it."
    types := [``CardKind, ``Response, ``Outcome]
    engine := [⟨"judge(kind, response)", ``Engine.judgeCode⟩, ⟨"loudness(outcome)", ``Engine.loudness⟩,
      ⟨"follow_up_shown(response)", ``Engine.followUpShownCode⟩, ⟨"sides_swapped(kind, seed, index)", ``Engine.sidesSwappedCode⟩]
    requirements :=
      [ { id := "RG-003"
          title := "Recording a response"
          story := "As a modeller, I want every response to mean one thing, so that answers can be compared across experts."
          criteria := judgeCriteria ++
            [ { ears := .always "treat It depends and Not my area the same way on every kind of card"
                basis := .proven ``escapes_mean_the_same } ] },
        { id := "RG-004"
          title := "The size of each moment"
          story := "As a modeller, I want disagreement to be the biggest moment, so that the game does not teach experts to agree."
          criteria := loudnessCriteria ++
            [ { ears := .always "make no moment bigger than a possible catch"
                basis := .proven ``catch_is_loudest },
              { ears := .always "make a same call a smaller moment than a possible catch"
                basis := .proven ``same_call_is_quieter_than_catch },
              { ears := .always "make It depends the same size of moment as a same call"
                basis := .proven ``depends_is_as_loud_as_same_call },
              { ears := .whenever "an expert misses a check card" "make no moment of it"
                basis := .proven ``missed_check_is_silent } ] },
        { id := "RG-011"
          title := "Sides and follow-ups"
          story := "As a modeller, I want a habit of swiping one way to show no pattern of agreement, so that an answer means something."
          criteria :=
            [ { ears := .always "keep yes on the right on yes or no cards"
                basis := .proven ``yes_stays_on_the_right },
              { ears := .always "place a prediction card's answers on opposite sides for consecutive seeds"
                basis := .proven ``sides_balance_across_seeds },
              { ears := .always "show a follow-up only when the expert made a call on the case it follows"
                basis := .proven ``follow_up_needs_a_call } ] } ] }

def standing : SpecFile :=
  { folder := "review-game-standing"
    title := "Catches, titles and the streak"
    intro := "What a person's standing rests on, and what brings them back each week."
    types := [``Catch, ``CatchState, ``Standing, ``Title, ``Streak]
    engine := [⟨"title(upheld, checks)", ``Engine.title⟩, ⟨"streak_week(weeks, passes, answered)", ``Engine.streakWeek⟩]
    requirements :=
      [ { id := "RG-005"
          title := "Titles"
          story := "As an expert, I want a title that reflects the quality of my reviews, so that going fast earns nothing."
          criteria := titleCriteria ++
            [ { ears := .whenever "a person answers more cases" "leave their title as it is"
                basis := .proven ``answering_keeps_title },
              { ears := .whenever "any outcome except a passed check is recorded" "leave the person's title as it is"
                basis := .proven ``recording_keeps_title },
              { ears := .always "never lower a title when catches are upheld or check cards are passed"
                basis := .proven ``title_never_falls } ] },
        { id := "RG-006"
          title := "Reviewing a catch"
          story := "As an area owner, I want to decide each catch once, so that a catch means someone accountable agreed."
          criteria :=
            [ { ears := .unwanted "the finder of a catch tries to review it" "refuse the review"
                basis := .proven ``finder_cannot_review },
              { ears := .unwanted "a catch has already been decided" "refuse another review"
                basis := .proven ``review_is_final },
              { ears := .whenever "a catch is pending or dismissed" "give the finder no credit for it"
                basis := .proven ``unupheld_catch_earns_nothing } ] },
        { id := "RG-007"
          title := "The weekly streak"
          story := "As an expert, I want a week off not to cost me my streak, so that the game fits around my job."
          criteria :=
            [ { ears := .whenever "a week closes with at least one answer of any kind" "extend the streak by one week"
                basis := .proven ``one_answer_extends },
              { ears := .whenever "a week closes with at least one answer" "spend no standby pass"
                basis := .proven ``answering_spends_no_pass },
              { ears := .whenever "a week closes with no answer and a standby pass in hand" "spend one pass and keep the streak"
                basis := .proven ``pass_protects_streak },
              { ears := .whenever "a week closes with no answer and no standby pass" "end the streak"
                basis := .proven ``no_pass_ends_streak },
              { ears := .always s!"start each person with {passLimit} standby passes and never add to them when a week closes"
                basis := .proven ``passes_never_grow } ] } ] }

def crew : SpecFile :=
  { folder := "review-game-crew"
    title := "A crew's answers"
    intro := "How a crew's answers stay independent, and when the crew sees its split. The first design waited for every seat. The model showed one person on leave would hide the split from everyone, so on 2026-11-05 the rule became: reveal once nobody is still waiting, with a quest's deadline for anyone who ignores the game."
    types := [``SeatState, ``Seat, ``Tally, ``RevealRule]
    engine := [⟨"crew_revealed(rule, answered, notMine, onLeave, waiting)", ``Engine.crewRevealed⟩]
    requirements :=
      [ { id := "RG-008"
          title := "Answers stay independent"
          story := "As a modeller, I want each expert's answer to be their own, so that agreement means something."
          criteria :=
            [ { ears := .during "a crew's split has not been revealed" "show nothing that depends on what anyone chose"
                basis := .proven ``choices_stay_hidden } ] },
        { id := "RG-009"
          title := "When a crew sees its split"
          story := "As an expert, I want to see how my crew answered, so that my answer feels connected to other people's."
          criteria :=
            [ { ears := .whenever "nobody in a crew is still waiting and at least one person answered" "reveal the split"
                basis := .proven ``chosen_rule_cannot_stall },
              { ears := .whenever "someone in a crew says it is not their area" "still reveal the split to the others"
                basis := .proven ``not_my_area_holds_nobody_up },
              { ears := .whenever "a quest's deadline passes and at least one person answered" "treat anyone still waiting as away and reveal the split"
                basis := .proven ``chosen_rule_settles_at_deadline } ] } ] }

def evidence : SpecFile :=
  { folder := "review-game-evidence"
    title := "From answers to a proposed confirmation"
    intro := "How answers connect to the rules they are about. The game proposes the attribute a modeller may add, and it never changes a rule's status."
    types := [``Answer, ``Proposal]
    requirements :=
      [ { id := "RG-010"
          title := "Proposing a confirmation"
          story := "As a modeller, I want a proposal only when the evidence is current and independent, so that a confirmation means what it says."
          criteria :=
            [ { ears := .whenever "a rule changed after an answer was given" "not count that answer"
                basis := .proven ``stale_answers_do_not_count },
              { ears := .unwanted "the area owner has not upheld a rule" s!"make no proposal, however many people agree"
                basis := .proven ``no_proposal_without_owner },
              { ears := .whenever "a proposal is made" "name the fingerprint of the rule as it stands now"
                basis := .proven ``proposal_names_current_fingerprint },
              { ears := .whenever "one person answers several times" "count that person once"
                basis := .proven ``same_person_counts_once } ] } ] }

def all : List SpecFile := [shift, answers, standing, crew, evidence]

/-- Where each engine lives and how the spec's tasks check it. -/
structure Target where
  name : String
  path : String
  check : String

def targets : List Target :=
  [ ⟨"Lean compiled to WebAssembly with Lasm, the app's engine", "engines/lasm", "`npm run test:browsers` passes"⟩,
    ⟨"JavaScript, the app's fallback", "engines/js/engine.js", "`npm run test:engines` passes"⟩,
    ⟨"Rust compiled to WebAssembly, for comparison", "engines/rust", "`npm run test:engines` passes and `scripts/check-connected.sh` proves the Rust equal to the model"⟩ ]

end Game.Spec
