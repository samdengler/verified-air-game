import Design.Tokens
import Game.Outcome

/-! # The design rules, as theorems about the tokens

Each is checked by Lean's kernel, on exact whole-number arithmetic. -/

namespace Design

/-- Every pair of colours the UI may use. Anything else is a defect. -/
def allowedPairs : List Pair :=
  [ ⟨.white, .airlineBlue, .text⟩, ⟨.white, .navy, .text⟩, ⟨.white, .bright, .text⟩, ⟨.white, .red, .text⟩,
    ⟨.navy, .paper, .text⟩, ⟨.navy, .white, .text⟩, ⟨.navy, .ice, .text⟩,
    ⟨.airlineBlue, .paper, .text⟩, ⟨.airlineBlue, .white, .text⟩, ⟨.mute, .paper, .text⟩,
    ⟨.red, .paper, .text⟩, ⟨.red, .white, .text⟩, ⟨.white, .redDark, .text⟩,
    ⟨.red, .ice, .largeText⟩,
    ⟨.white, .airlineBlue, .graphic⟩, ⟨.white, .navy, .graphic⟩, ⟨.white, .bright, .graphic⟩, ⟨.white, .red, .graphic⟩,
    ⟨.red, .paper, .graphic⟩, ⟨.airlineBlue, .paper, .graphic⟩, ⟨.red, .navy, .graphic⟩,
    ⟨.navy, .ice, .graphic⟩,
    ⟨.airlineBlue, .tint, .text⟩, ⟨.navy, .tint, .text⟩, ⟨.mute, .tint, .text⟩,
    ⟨.white, .navyRaised, .graphic⟩, ⟨.navy, .white, .graphic⟩, ⟨.red, .white, .graphic⟩ ]

/-- Pairs the UI must not use for the use shown. -/
def forbiddenPairs : List Pair :=
  [ ⟨.red, .airlineBlue, .graphic⟩, ⟨.red, .airlineBlue, .text⟩, ⟨.bright, .navy, .graphic⟩,
    ⟨.bright, .airlineBlue, .graphic⟩, ⟨.red, .navyRaised, .graphic⟩, ⟨.red, .ice, .text⟩ ]

theorem allowed_pairs_pass : allowedPairs.all Pair.passes = true := by decide +kernel

/-- Each forbidden pair fails on the most generous rounding, so the ban is not a
matter of taste. Red on airline blue is the main one: the two brand colours together
do not reach 3 to 1. -/
theorem forbidden_pairs_fail : forbiddenPairs.all Pair.fails = true := by decide +kernel

theorem no_pair_is_both_allowed_and_forbidden :
    allowedPairs.all (fun p => !forbiddenPairs.contains p) = true := by decide +kernel

/-- Text is readable on every surface. -/
theorem ink_is_readable_on_every_surface :
    Surface.all.all (fun s => (Pair.mk s.ink s.ground .text).passes) = true := by decide +kernel

/-- The focus ring shows on every surface. -/
theorem focus_ring_shows_on_every_surface :
    Surface.all.all (fun s => (Pair.mk s.focusRing s.ground .graphic).passes) = true := by decide +kernel

/-- The smallest lightness difference between surfaces that are told apart, times 100.
WCAG sets no number for this, so 125 is our own choice. -/
def surfaceBar : Nat := 125

/-- The grounds a person has to tell apart at a glance. -/
def resultGrounds : List Token := [.airlineBlue, .bright, .red, .navy, .ice]

/-- Result grounds differ in lightness as well as hue, so colour is never the only signal. -/
theorem result_grounds_differ_in_lightness :
    resultGrounds.all (fun a => resultGrounds.all fun b =>
      a == b || surfaceBar ≤ contrastLow a.color b.color) = true := by decide +kernel

theorem controls_meet_touch_target : controls.all (minTouchTarget ≤ ·.height) = true := by decide

theorem type_is_never_too_small : TypeRole.all.all (minTextPx ≤ ·.px) = true := by decide

/-- Every step in the type scale is smaller than the one above. -/
theorem type_scale_descends :
    TypeRole.display.px > TypeRole.heading.px ∧ TypeRole.heading.px > TypeRole.caseText.px ∧
      TypeRole.caseText.px > TypeRole.body.px ∧ TypeRole.body.px > TypeRole.label.px := by decide

theorem motions_stay_short : motions.all (·.ms ≤ maxMotionMs) = true := by decide

/-- Reduced motion removes every animation. -/
theorem reduced_motion_removes_animation : motions.all (·.reducedMs == 0) = true := by decide

/-- Which surface each outcome of the game gets. This is where the design system meets
the game's model. -/
def surfaceOf : Game.Outcome → Surface
  | .possibleCatch | .checkPassed => .possibleCatch
  | .sameCall => .sameCall
  | .decisionSent => .decision
  | .exception | .checkMissed | .routed => .asking

/-- Which surface a case asks on, by kind of card. A follow-up shows a computed result, so it
gets its own surface, and a decision gets the dark one to mark what is at stake. -/
def askingSurface : Game.CardKind → Surface
  | .decide | .reconcile => .decision
  | .followUp => .consequence
  | .predict | .confirm | .check => .asking

/-- The biggest moments, and only those, get the red ground. -/
theorem red_means_the_biggest_moment (o : Game.Outcome) :
    surfaceOf o = .possibleCatch ↔ o.loudness = 3 := by
  cases o <;> decide

/-- A missed check looks the same as asking, so it never tells an expert they were wrong. -/
theorem missed_check_shows_nothing : surfaceOf .checkMissed = .asking := rfl

end Design
