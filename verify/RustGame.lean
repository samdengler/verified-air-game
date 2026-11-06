import Rust.ReviewGame
import Game.Engine

/-!
# The Rust engine computes what the model computes

`verify/Rust/ReviewGame.lean` is generated: Charon and Aeneas translate
`engines/rust/core/src/lib.rs` into Lean, one function per Rust function, with
Rust's integers modelled exactly and each function returning a `Result` that would
record a panic.

The theorems below say that each translated function returns without failing and
gives the model's answer. This proves the translation. It does not prove Charon,
Aeneas, rustc, LLVM or the wrapper in `engines/rust/wasm`, which are trusted.
-/

open Aeneas Aeneas.Std Result

namespace Verify

def phaseOf : review_game.Phase → Game.Phase
  | .Intro => .intro | .Asking => .asking | .Revealed => .revealed | .Done => .done

def eventOf : review_game.Event → Game.Event
  | .Start => .start | .Call => .call | .Depends => .depends | .NotMine => .notMine | .Next => .next

def kindOf : review_game.CardKind → Game.CardKind
  | .Predict => .predict | .Confirm => .confirm | .Decide => .decide | .Check => .check
  | .FollowUp => .followUp | .Reconcile => .reconcile

def responseOf : review_game.Response → Game.Response
  | .Agrees => .agrees | .Differs => .differs | .Depends => .depends | .NotMine => .notMine

def outcomeOf : review_game.Outcome → Game.Outcome
  | .SameCall => .sameCall | .PossibleCatch => .possibleCatch | .Exception => .exception
  | .DecisionSent => .decisionSent | .CheckPassed => .checkPassed | .CheckMissed => .checkMissed
  | .Routed => .routed

def titleOf : review_game.Title → Game.Title
  | .ShiftLead => .shiftLead | .DutyManager => .dutyManager | .StationManager => .stationManager

def ruleOf : review_game.RevealRule → Game.RevealRule
  | .EverySeat => .everySeat | .EveryoneAvailable => .everyoneAvailable

def sessionOf (s : review_game.Session) : Game.Session :=
  ⟨phaseOf s.phase, s.index.val, s.length.val⟩

/-- Moving past a case returns without failing and gives the model's session. -/
theorem advance_matches_model (s : review_game.Session) :
    review_game.advance s ⦃ r => sessionOf r = (sessionOf s).advance ⦄ := by
  unfold review_game.advance
  split
  · step as ⟨i, hi⟩
    split
    · step as ⟨i1, hi1⟩
      simp only [sessionOf, Game.Session.advance, phaseOf]
      have : s.index.val + 1 < s.length.val := by scalar_tac
      simp [this, hi1]
    · simp only [sessionOf, Game.Session.advance, phaseOf]
      have : ¬ s.index.val + 1 < s.length.val := by scalar_tac
      simp [this]
  · simp only [sessionOf, Game.Session.advance, phaseOf]
    have : ¬ s.index.val + 1 < s.length.val := by scalar_tac
    simp [this]

/-- For every session and event, the Rust `step` returns without failing and gives the model's answer. -/
theorem step_matches_model (s : review_game.Session) (e : review_game.Event) :
    review_game.step s e ⦃ r => r.map sessionOf = (sessionOf s).step (eventOf e) ⦄ := by
  rcases s with ⟨p, i, l⟩
  unfold review_game.step
  cases p <;> cases e
  all_goals try (simp [phaseOf, eventOf, sessionOf, Game.Session.step]; done)
  · -- Intro, Start
    by_cases h0 : l = 0#u32
    · simp [h0, phaseOf, eventOf, sessionOf, Game.Session.step]
    · have hv : ¬ l.val = 0 := by scalar_tac
      simp [h0, hv, phaseOf, eventOf, sessionOf, Game.Session.step]
  · -- Asking, Not my area
    step with advance_matches_model as ⟨r, hr⟩
    simpa [phaseOf, eventOf, sessionOf, Game.Session.step] using hr
  · -- Revealed, Next
    step with advance_matches_model as ⟨r, hr⟩
    simpa [phaseOf, eventOf, sessionOf, Game.Session.step] using hr

/-- For every kind of card and response, the Rust `judge` gives the model's outcome. -/
theorem judge_matches_model (k : review_game.CardKind) (r : review_game.Response) :
    review_game.judge k r ⦃ o => outcomeOf o = Game.judge (kindOf k) (responseOf r) ⦄ := by
  cases k <;> cases r <;> simp [review_game.judge, outcomeOf, Game.judge, kindOf, responseOf]

/-- For every outcome, the Rust `loudness` gives the model's moment. -/
theorem loudness_matches_model (o : review_game.Outcome) :
    review_game.loudness o ⦃ n => n.val = (outcomeOf o).loudness ⦄ := by
  cases o <;> simp [review_game.loudness, outcomeOf, Game.Outcome.loudness]

/-- For every count, the Rust `title` gives the model's title, whatever the number
of cases answered, because the Rust function does not even take that number. -/
theorem title_matches_model (answered : Nat) (u c : Std.U32) :
    review_game.title u c ⦃ t => titleOf t = Game.Standing.title ⟨answered, u.val, c.val⟩ ⦄ := by
  have e6u : (6#u32 ≤ u) ↔ 6 ≤ u.val := by simp [UScalar.le_equiv]
  have e6c : (6#u32 ≤ c) ↔ 6 ≤ c.val := by simp [UScalar.le_equiv]
  have e3u : (3#u32 ≤ u) ↔ 3 ≤ u.val := by simp [UScalar.le_equiv]
  have e3c : (3#u32 ≤ c) ↔ 3 ≤ c.val := by simp [UScalar.le_equiv]
  unfold review_game.title Game.Standing.title
  simp only [Game.stationManagerBar, Game.dutyManagerBar, e6u, e6c, e3u, e3c]
  by_cases h6u : 6 ≤ u.val <;> by_cases h6c : 6 ≤ c.val <;> by_cases h3u : 3 ≤ u.val <;> by_cases h3c : 3 ≤ c.val <;>
    simp [*, titleOf]

/-- For every tally and rule, the Rust `revealed` gives the model's answer. -/
theorem revealed_matches_model (rule : review_game.RevealRule) (a n l w : Std.U32) :
    review_game.revealed rule a n l w ⦃ b => b = Game.revealed (ruleOf rule) ⟨a.val, n.val, l.val, w.val⟩ ⦄ := by
  cases rule <;> unfold review_game.revealed <;> simp only [ruleOf, Game.revealed]
  all_goals
    repeat' split
  all_goals simp_all

def streakOf (s : review_game.Streak) : Game.Streak := ⟨s.weeks.val, s.passes.val⟩

/-- Closing a week matches the model while the week count is below the type's limit. -/
theorem close_week_matches_model (s : review_game.Streak) (a : Bool) (h : s.weeks.val < Std.U32.max) :
    review_game.close_week s a ⦃ t => streakOf t = (streakOf s).closeWeek a ⦄ := by
  unfold review_game.close_week
  cases a
  · simp only [Bool.false_eq_true, ite_false]
    split
    · step as ⟨p, hp⟩
      have hv : 0 < s.passes.val := by scalar_tac
      simp [streakOf, Game.Streak.closeWeek, hv, hp]
    · have hv : ¬ 0 < s.passes.val := by scalar_tac
      simp [streakOf, Game.Streak.closeWeek, hv]
  · simp only [ite_true]
    step as ⟨w, hw⟩
    simp [streakOf, Game.Streak.closeWeek, hw]

/-- For every number of cases, the Rust `shift_length` gives the model's length. -/
theorem shift_length_matches_model (cases : Std.U32) :
    review_game.shift_length cases ⦃ n => n.val = (Game.Session.new cases.val).length ⦄ := by
  unfold review_game.shift_length
  simp only [Game.Session.new, Game.shiftLimit]
  split
  · have : cases.val < 5 := by scalar_tac
    simp; omega
  · have : ¬ cases.val < 5 := by scalar_tac
    simp; omega

theorem follow_up_shown_matches_model (r : review_game.Response) :
    review_game.follow_up_shown r ⦃ b => b = Game.followUpShown (responseOf r) ⦄ := by
  cases r <;> simp [review_game.follow_up_shown, responseOf, Game.followUpShown]

theorem yes_stays_right_matches_model (k : review_game.CardKind) :
    review_game.yes_stays_right k ⦃ b => b = (kindOf k).yesStaysRight ⦄ := by
  cases k <;> simp [review_game.yes_stays_right, kindOf, Game.CardKind.yesStaysRight]

/-- For every kind, seed and index, the Rust `sides_swapped` gives the model's answer. -/
theorem sides_swapped_matches_model (k : review_game.CardKind) (seed index : Std.U32) :
    review_game.sides_swapped k seed index ⦃ b => b = Game.sidesSwapped (kindOf k) seed.val index.val ⦄ := by
  unfold review_game.sides_swapped
  step with yes_stays_right_matches_model as ⟨y, hy⟩
  split
  · simp_all [Game.sidesSwapped]
  · step as ⟨a, ha⟩
    step as ⟨b, hb⟩
    step as ⟨c, hc⟩
    step as ⟨d, hd⟩
    have hv : (kindOf k).yesStaysRight = false := by simp_all
    simp [Game.sidesSwapped, hv]
    have e1 : c.val = (seed.val % 2 + index.val % 2) := by simp_all
    have e2 : d.val = (seed.val % 2 + index.val % 2) % 2 := by simp_all
    have : (d = 1#u32) ↔ d.val = 1 := by scalar_tac
    simp_all
    by_cases h : (seed.val + index.val) % 2 = 1 <;> simp [h]

/-! Each mapping is one-to-one, so no two Rust values stand for the same model value. -/

theorem phaseOf_bijective : Function.Bijective phaseOf := by
  constructor
  · intro a b h; cases a <;> cases b <;> first | rfl | cases h
  · intro s; cases s
    exacts [⟨.Intro, rfl⟩, ⟨.Asking, rfl⟩, ⟨.Revealed, rfl⟩, ⟨.Done, rfl⟩]

theorem eventOf_bijective : Function.Bijective eventOf := by
  constructor
  · intro a b h; cases a <;> cases b <;> first | rfl | cases h
  · intro s; cases s
    exacts [⟨.Start, rfl⟩, ⟨.Call, rfl⟩, ⟨.Depends, rfl⟩, ⟨.NotMine, rfl⟩, ⟨.Next, rfl⟩]

theorem outcomeOf_bijective : Function.Bijective outcomeOf := by
  constructor
  · intro a b h; cases a <;> cases b <;> first | rfl | cases h
  · intro s; cases s
    exacts [⟨.SameCall, rfl⟩, ⟨.PossibleCatch, rfl⟩, ⟨.Exception, rfl⟩, ⟨.DecisionSent, rfl⟩,
      ⟨.CheckPassed, rfl⟩, ⟨.CheckMissed, rfl⟩, ⟨.Routed, rfl⟩]

theorem titleOf_bijective : Function.Bijective titleOf := by
  constructor
  · intro a b h; cases a <;> cases b <;> first | rfl | cases h
  · intro s; cases s
    exacts [⟨.ShiftLead, rfl⟩, ⟨.DutyManager, rfl⟩, ⟨.StationManager, rfl⟩]

theorem kindOf_bijective : Function.Bijective kindOf := by
  constructor
  · intro a b h; cases a <;> cases b <;> first | rfl | cases h
  · intro s; cases s
    exacts [⟨.Predict, rfl⟩, ⟨.Confirm, rfl⟩, ⟨.Decide, rfl⟩, ⟨.Check, rfl⟩, ⟨.FollowUp, rfl⟩, ⟨.Reconcile, rfl⟩]

theorem responseOf_bijective : Function.Bijective responseOf := by
  constructor
  · intro a b h; cases a <;> cases b <;> first | rfl | cases h
  · intro s; cases s
    exacts [⟨.Agrees, rfl⟩, ⟨.Differs, rfl⟩, ⟨.Depends, rfl⟩, ⟨.NotMine, rfl⟩]

end Verify
