/-! # The weekly streak and standby passes -/

namespace Game

structure Streak where
  weeks : Nat
  passes : Nat
  deriving DecidableEq, Repr

/-- The standby passes a person starts with. -/
def passLimit : Nat := 2

def Streak.new : Streak := ⟨0, passLimit⟩

/-- Close a week. One answer of any kind keeps the streak going. A week with no
answer spends a pass. A week with no answer and no pass ends the streak. -/
def Streak.closeWeek (s : Streak) (answered : Bool) : Streak :=
  if answered then { s with weeks := s.weeks + 1 }
  else if 0 < s.passes then { s with passes := s.passes - 1 }
  else { s with weeks := 0 }

theorem one_answer_extends (s : Streak) : (s.closeWeek true).weeks = s.weeks + 1 := rfl

theorem answering_spends_no_pass (s : Streak) : (s.closeWeek true).passes = s.passes := rfl

/-- A week off with a pass in hand costs the pass and keeps the streak. -/
theorem pass_protects_streak (s : Streak) (h : 0 < s.passes) :
    (s.closeWeek false).weeks = s.weeks ∧ (s.closeWeek false).passes = s.passes - 1 := by
  simp [Streak.closeWeek, h]

theorem no_pass_ends_streak (s : Streak) (h : s.passes = 0) : (s.closeWeek false).weeks = 0 := by
  simp [Streak.closeWeek, h]

theorem passes_never_grow (s : Streak) (a : Bool) : (s.closeWeek a).passes ≤ s.passes := by
  unfold Streak.closeWeek
  split
  · exact Nat.le_refl _
  · split
    · exact Nat.sub_le _ _
    · exact Nat.le_refl _

end Game
