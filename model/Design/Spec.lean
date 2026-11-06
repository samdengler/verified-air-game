import Design.Rules
import Game.Spec

/-! # The design system's spec, as values of the model -/

namespace Design.Spec

open Design Game.Spec
open Lean (Name)

def ratioText (n : Nat) : String :=
  let frac := n % 100
  s!"{n / 100}.{if frac < 10 then "0" else ""}{frac}"

def pairCriteria : List Criterion :=
  allowedPairs.map fun p =>
    { ears := .whenever s!"{p.fg.name} is used for {p.use.name} on {p.bg.name}"
        s!"keep a contrast of at least {ratioText p.use.required} to 1, and this pair measures at least {ratioText p.low} to 1"
      basis := .modelled ``Pair.low }

def forbiddenCriteria : List Criterion :=
  forbiddenPairs.map fun p =>
    { ears := .unwanted s!"{p.fg.name} would be used for {p.use.name} on {p.bg.name}"
        s!"treat it as a defect, because it measures below {ratioText p.use.required} to 1"
      basis := .proven ``forbidden_pairs_fail }

def typeCriteria : List Criterion :=
  TypeRole.all.map fun t =>
    { ears := .always s!"set {t.name} text at {t.px} pixels"
      basis := .modelled ``TypeRole.px }

def controlCriteria : List Criterion :=
  controls.map fun c =>
    { ears := .always s!"make a {c.name} {c.height} pixels tall"
      basis := .modelled ``controls }

def motionCriteria : List Criterion :=
  motions.map fun m =>
    { ears := .whenever s!"{m.name} plays"
        s!"finish in {m.ms} ms, or in {m.reducedMs} ms when the person asks for reduced motion"
      basis := .modelled ``motions }

def designSystem : SpecFile :=
  { folder := "design-system"
    title := "The verified design system"
    intro := "The tokens and rules every screen must follow. Documentation, code and UI checks are generated from the same Lean model."
    types := [``Token, ``Use, ``Pair, ``Surface, ``TypeRole, ``Control, ``Motion]
    requirements :=
      [ { id := "DS-001"
          title := "Colour pairs that are allowed"
          story := "As an expert on a phone in bright light, I want every screen to be readable, so that I can answer anywhere."
          criteria := pairCriteria ++
            [ { ears := .always "pass WCAG contrast for every allowed pair"
                basis := .proven ``allowed_pairs_pass },
              { ears := .always "keep text readable on every surface"
                basis := .proven ``ink_is_readable_on_every_surface } ] },
        { id := "DS-002"
          title := "Colour pairs that are forbidden"
          story := "As a designer, I want the model to stop pairs that cannot pass, so that a brand colour is not misused."
          criteria := forbiddenCriteria ++
            [ { ears := .always "keep the forbidden and allowed lists apart"
                basis := .proven ``no_pair_is_both_allowed_and_forbidden } ] },
        { id := "DS-003"
          title := "Telling results apart"
          story := "As an expert with low colour vision, I want results to differ in more than hue, so that I can tell them apart."
          criteria :=
            [ { ears := .always s!"keep every two result grounds at least {ratioText surfaceBar} to 1 apart in lightness"
                basis := .proven ``result_grounds_differ_in_lightness },
              { ears := .always "show the red ground for the biggest moments and for nothing else"
                basis := .proven ``red_means_the_biggest_moment },
              { ears := .whenever "an expert misses a check card" "show the ordinary asking ground"
                basis := .proven ``missed_check_shows_nothing } ] },
        { id := "DS-004"
          title := "Touch and focus"
          story := "As an expert using one thumb or a keyboard, I want controls I can reach and see, so that I never mis-tap."
          criteria := controlCriteria ++
            [ { ears := .always s!"make every control at least {minTouchTarget} pixels tall"
                basis := .proven ``controls_meet_touch_target },
              { ears := .always "show the focus ring on every surface"
                basis := .proven ``focus_ring_shows_on_every_surface } ] },
        { id := "DS-005"
          title := "Type"
          story := "As an expert, I want the case to be the largest thing I read, so that a review takes no effort."
          criteria := typeCriteria ++
            [ { ears := .always s!"never set text below {minTextPx} pixels"
                basis := .proven ``type_is_never_too_small },
              { ears := .always "keep each step of the type scale smaller than the one above"
                basis := .proven ``type_scale_descends } ] },
        { id := "DS-006"
          title := "Motion"
          story := "As an expert sensitive to motion, I want animation to be short and to go away when I ask, so that the game stays usable."
          criteria := motionCriteria ++
            [ { ears := .always s!"keep every animation at or under {maxMotionMs} ms"
                basis := .proven ``motions_stay_short },
              { ears := .whenever "a person asks for reduced motion" "remove every animation"
                basis := .proven ``reduced_motion_removes_animation } ] } ] }

def all : List SpecFile := [designSystem]

end Design.Spec
