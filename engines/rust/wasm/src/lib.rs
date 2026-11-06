//! The proved Rust rules behind whole numbers, for the browser. These few lines only
//! translate numbers to the rules' arguments and back. They are not part of the proof.
use review_game::*;

const KINDS: [CardKind; 6] =
    [CardKind::Predict, CardKind::Confirm, CardKind::Decide, CardKind::Check, CardKind::FollowUp, CardKind::Reconcile];
const RESPONSES: [Response; 4] = [Response::Agrees, Response::Differs, Response::Depends, Response::NotMine];

fn phase_of(c: u32) -> Option<Phase> {
    [Phase::Intro, Phase::Asking, Phase::Revealed, Phase::Done].get(c as usize).copied()
}
fn event_of(c: u32) -> Option<Event> {
    [Event::Start, Event::Call, Event::Depends, Event::NotMine, Event::Next].get(c as usize).copied()
}

#[no_mangle]
pub extern "C" fn session_step(phase: u32, index: u32, length: u32, event: u32) -> i32 {
    let (Some(p), Some(e)) = (phase_of(phase), event_of(event)) else { return -2 };
    match step(Session { phase: p, index, length }, e) {
        Some(t) => (t.phase as i32) * 256 + t.index as i32,
        None => -1,
    }
}

#[no_mangle]
pub extern "C" fn judge_code(kind: u32, response: u32) -> i32 {
    let k = KINDS.get(kind as usize).copied();
    let r = RESPONSES.get(response as usize).copied();
    let (Some(k), Some(r)) = (k, r) else { return -2 };
    judge(k, r) as i32
}

#[no_mangle]
pub extern "C" fn loudness_code(outcome: u32) -> i32 {
    use Outcome::*;
    match [SameCall, PossibleCatch, Exception, DecisionSent, CheckPassed, CheckMissed, Routed].get(outcome as usize) {
        Some(&o) => loudness(o) as i32,
        None => -2,
    }
}

#[no_mangle]
pub extern "C" fn title_code(upheld: u32, checks: u32) -> i32 {
    title(upheld, checks) as i32
}

#[no_mangle]
pub extern "C" fn streak_week(weeks: u32, passes: u32, answered: u32) -> i32 {
    let s = close_week(Streak { weeks, passes }, answered != 0);
    (s.weeks as i32) * 256 + s.passes as i32
}

#[no_mangle]
pub extern "C" fn crew_revealed(rule: u32, answered: u32, not_mine: u32, on_leave: u32, waiting: u32) -> i32 {
    let r = match rule {
        0 => RevealRule::EverySeat,
        1 => RevealRule::EveryoneAvailable,
        _ => return -2,
    };
    revealed(r, answered, not_mine, on_leave, waiting) as i32
}

#[no_mangle]
pub extern "C" fn shift_length_code(cases: u32) -> i32 {
    shift_length(cases) as i32
}

#[no_mangle]
pub extern "C" fn follow_up_shown_code(response: u32) -> i32 {
    match RESPONSES.get(response as usize) {
        Some(&r) => follow_up_shown(r) as i32,
        None => -2,
    }
}

#[no_mangle]
pub extern "C" fn sides_swapped_code(kind: u32, seed: u32, index: u32) -> i32 {
    match KINDS.get(kind as usize) {
        Some(&k) => sides_swapped(k, seed, index) as i32,
        None => -2,
    }
}
