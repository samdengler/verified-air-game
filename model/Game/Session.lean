/-! # A shift: the sequence of screens one expert moves through -/

namespace Game

/-- The most cases one shift can hold. -/
def shiftLimit : Nat := 5

inductive Phase where
  | intro | asking | revealed | done
  deriving DecidableEq, Repr, Inhabited

inductive Event where
  | start | call | depends | notMine | next
  deriving DecidableEq, Repr, Inhabited

def Phase.all : List Phase := [.intro, .asking, .revealed, .done]
def Event.all : List Event := [.start, .call, .depends, .notMine, .next]

structure Session where
  phase : Phase
  index : Nat
  length : Nat
  deriving DecidableEq, Repr

/-- A new shift, cut to the limit however many cases are on offer. -/
def Session.new (cases : Nat) : Session := ⟨.intro, 0, min cases shiftLimit⟩

/-- Move past the current case. -/
def Session.advance (s : Session) : Session :=
  if s.index + 1 < s.length then { s with phase := .asking, index := s.index + 1 }
  else { s with phase := .done }

/-- The rule for every screen and every thing an expert can do. `none` means the
event does nothing on that screen. -/
def Session.step (s : Session) (e : Event) : Option Session :=
  match s.phase, e with
  | .intro, .start => some (if s.length = 0 then { s with phase := .done } else { s with phase := .asking })
  | .asking, .call => some { s with phase := .revealed }
  | .asking, .depends => some { s with phase := .revealed }
  | .asking, .notMine => some s.advance
  | .revealed, .next => some s.advance
  | _, _ => none

/-- A session the game can actually be in. -/
def Session.Valid (s : Session) : Prop :=
  s.length ≤ shiftLimit ∧
    match s.phase with
    | .intro => s.index = 0
    | .asking | .revealed => s.index < s.length
    | .done => True

/-- How far a session is from the report: every step lowers this. -/
def Session.remaining (s : Session) : Nat :=
  match s.phase with
  | .intro => 2 * s.length + 1
  | .asking => 2 * (s.length - s.index)
  | .revealed => 2 * (s.length - s.index) - 1
  | .done => 0

theorem new_is_valid (cases : Nat) : (Session.new cases).Valid := by
  simp [Session.new, Session.Valid]; omega

theorem new_respects_limit (cases : Nat) : (Session.new cases).length ≤ shiftLimit := by
  simp [Session.new]; omega

theorem advance_keeps_length (s : Session) : s.advance.length = s.length := by
  unfold Session.advance; split <;> rfl

theorem advance_valid (s : Session) (h : s.length ≤ shiftLimit) : s.advance.Valid := by
  unfold Session.advance Session.Valid
  split <;> simp_all

/-- Every step from a valid session lands in a valid session. -/
theorem step_preserves_valid (s t : Session) (e : Event) (hs : s.Valid)
    (h : s.step e = some t) : t.Valid := by
  obtain ⟨hl, hp⟩ := hs
  rcases s with ⟨p, i, l⟩
  cases p <;> cases e <;> simp [Session.step] at h <;> subst h
  all_goals first
    | exact advance_valid _ hl
    | (simp_all [Session.Valid]; done)
    | (split <;> simp_all [Session.Valid] <;> omega)

theorem advance_remaining (s : Session) (h : s.index < s.length) :
    s.advance.remaining + 2 ≤ 2 * (s.length - s.index) := by
  unfold Session.advance
  split
  · simp only [Session.remaining]; omega
  · simp only [Session.remaining]; omega

/-- Every step moves closer to the report, so no shift can loop. -/
theorem step_reduces_remaining (s t : Session) (e : Event) (hs : s.Valid)
    (h : s.step e = some t) : t.remaining < s.remaining := by
  obtain ⟨hl, hp⟩ := hs
  rcases s with ⟨p, i, l⟩
  cases p <;> cases e <;> simp [Session.step] at h <;> subst h
  · by_cases h0 : l = 0 <;> simp [h0, Session.remaining]
    omega
  · simp only at hp; simp only [Session.remaining]; omega
  · simp only at hp; simp only [Session.remaining]; omega
  · have h2 := advance_remaining ⟨.asking, i, l⟩ hp
    dsimp only at h2
    show Session.remaining _ < 2 * (l - i)
    omega
  · have h2 := advance_remaining ⟨.revealed, i, l⟩ hp
    dsimp only at h2
    show Session.remaining _ < 2 * (l - i) - 1
    omega

/-- It depends and Not my area work on every case. -/
theorem escapes_always_work (s : Session) (h : s.phase = .asking) :
    (s.step .depends).isSome ∧ (s.step .notMine).isSome := by
  simp [Session.step, h]

/-- Every screen except the report has a way forward. -/
theorem no_dead_ends (s : Session) (h : s.phase ≠ .done) : ∃ e t, s.step e = some t := by
  rcases s with ⟨p, i, l⟩
  cases p
  · exact ⟨.start, _, rfl⟩
  · exact ⟨.call, _, rfl⟩
  · exact ⟨.next, _, rfl⟩
  · simp at h

/-- Reaching the report by some sequence of steps. -/
inductive Finishes : Session → Prop
  | atReport (s : Session) : s.phase = .done → Finishes s
  | byStep (s t : Session) (e : Event) : s.step e = some t → Finishes t → Finishes s

/-- Every shift can reach the report. -/
theorem every_shift_finishes (s : Session) (hs : s.Valid) : Finishes s := by
  induction h : s.remaining using Nat.strongRecOn generalizing s with
  | _ n ih =>
    by_cases hd : s.phase = .done
    · exact .atReport s hd
    · obtain ⟨e, t, he⟩ := no_dead_ends s hd
      exact .byStep s t e he
        (ih _ (h ▸ step_reduces_remaining s t e hs he) t (step_preserves_valid s t e hs he) rfl)

/-- A card as the game sees it. The outcome is opaque, because the game knows
nothing about airlines. The deck picks the type, and for an airline card it is
the type the rule itself returns. -/
structure Card (Outcome : Type) where
  id : Nat
  outcome : Outcome

/-- Everything the page may show. The page draws this and nothing else. -/
inductive Screen (Outcome : Type) where
  | intro
  | face (id : Nat)
  | reveal (id : Nat) (outcome : Outcome)
  | report
  deriving DecidableEq, Repr

def view {O : Type} (cardAt : Nat → Card O) (s : Session) : Screen O :=
  match s.phase with
  | .intro => .intro
  | .asking => .face (cardAt s.index).id
  | .revealed => .reveal (cardAt s.index).id (cardAt s.index).outcome
  | .done => .report

/-- You call it before you see it: while a case is showing, the screen cannot
depend on the case's outcome. -/
theorem face_hides_outcome {O : Type} (d₁ d₂ : Nat → Card O) (s : Session)
    (h : s.phase = .asking) (hid : (d₁ s.index).id = (d₂ s.index).id) :
    view d₁ s = view d₂ s := by
  simp [view, h, hid]

end Game
