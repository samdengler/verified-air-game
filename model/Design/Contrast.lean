/-! # WCAG contrast, computed exactly

WCAG's relative luminance raises a channel to the power 2.4. Lean's kernel can check
that with whole numbers: `y = x ^ 2.4` is the same as `y ^ 5 = x ^ 12`. So each channel
is bracketed between two fixed-point values by exact integer comparison, and a contrast
ratio is given as a lower and an upper bound. A rule passes only if the lower bound
clears it, and fails only if the upper bound misses it, so rounding cannot flip a verdict. -/

namespace Design

structure Color where
  r : Nat
  g : Nat
  b : Nat
  deriving DecidableEq, Repr

/-- Channels are scaled by this. -/
def scale : Nat := 1000000

/-- The largest `t ≤ hi` with `ok t`, by bisection on a monotone test. -/
def bisect (ok : Nat → Bool) : Nat → Nat → Nat → Nat
  | 0, lo, _ => lo
  | fuel + 1, lo, hi =>
    let mid := (lo + hi) / 2
    if mid == lo then lo
    else if ok mid then bisect ok fuel mid hi
    else bisect ok fuel lo mid

/-- A channel's linear value, rounded down to `1 / scale`.
For `c / 255 ≤ 0.04045`, that is `c ≤ 10`, WCAG divides by 12.92.
Above that, `x = (c + 14.025) / 269.025`, and `t` is the largest value with
`(t / scale) ^ 5 ≤ x ^ 12`. -/
def linearLow (c : Nat) : Nat :=
  if c ≤ 10 then c * scale * 100 / (255 * 1292)
  else
    let n := c * 1000 + 14025
    let d := 269025
    bisect (fun t => t ^ 5 * d ^ 12 ≤ n ^ 12 * scale ^ 5) 24 0 (scale + 1)

/-- Relative luminance scaled by `10 ^ 10`, rounded down or up. -/
def lumLow (c : Color) : Nat :=
  2126 * linearLow c.r + 7152 * linearLow c.g + 722 * linearLow c.b

def lumHigh (c : Color) : Nat :=
  2126 * (linearLow c.r + 1) + 7152 * (linearLow c.g + 1) + 722 * (linearLow c.b + 1)

/-- WCAG adds 0.05 to each side. -/
def flare : Nat := 500000000

/-- A lower bound on the contrast ratio, times 100. -/
def contrastLow (a b : Color) : Nat :=
  let (light, dark) := if lumLow a ≥ lumLow b then (a, b) else (b, a)
  (lumLow light + flare) * 100 / (lumHigh dark + flare)

/-- An upper bound on the contrast ratio, times 100. -/
def contrastHigh (a b : Color) : Nat :=
  let (light, dark) := if lumLow a ≥ lumLow b then (a, b) else (b, a)
  (lumHigh light + flare) * 100 / (lumLow dark + flare) + 1

/-- Checks the method against values WCAG fixes: white on black is 21 to 1. -/
theorem white_on_black_is_21 :
    contrastLow ⟨255, 255, 255⟩ ⟨0, 0, 0⟩ ≥ 2099 ∧ contrastHigh ⟨255, 255, 255⟩ ⟨0, 0, 0⟩ ≤ 2101 := by
  decide +kernel

/-- A colour against itself is 1 to 1. -/
theorem same_colour_is_1 : contrastHigh ⟨0, 50, 104⟩ ⟨0, 50, 104⟩ ≤ 101 := by decide +kernel

end Design
