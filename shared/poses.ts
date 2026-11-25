// Funny Pose Challenge: the 24 poses a player can be asked to copy on the call, and the geometry that draws each one.
// Pure data and maths, shared by the server (which deals the poses and never needs to draw them) and the client (which draws the
// reference picture from the figure below). There is no secret in here: which pose a round uses stays hidden until the host reveals it.

export type PoseCategory = 'Reactions' | 'Heroes' | 'Sleepy & Thinking' | 'Dance Moves' | 'Attitude';

export type PoseFace = 'confused' | 'shocked' | 'laugh' | 'cry' | 'scared' | 'angry' | 'determined' | 'sleep' | 'yawn' | 'think' | 'smug' | 'cool' | 'silly' | 'dizzy' | 'wink' | 'grin' | 'roar' | 'robot' | 'meh';
export type PoseProp = 'cape' | 'zzz' | 'tears' | 'sweat' | 'stars' | 'music' | 'sparkles' | 'phone' | 'anger';

/** A limb: [upper, lower] segment angles in degrees. 0 = hanging straight down; positive = swung outward (90 = out to the side, 180 = straight up); past 180 = up and across. */
export type Limb = readonly [number, number];

export interface PoseFigure {
  face: PoseFace;
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  /** Whole-body lean in degrees (positive = to the right). */
  lean?: number;
  /** Extra head tilt on top of the lean. */
  tilt?: number;
  props?: readonly PoseProp[];
}

export interface PoseChallenge {
  id: string;
  title: string;
  /** What to do, in a sentence the performer can read at a glance. */
  cue: string;
  category: PoseCategory;
  /** A big emoji for the expression, drawn beside the figure. */
  badge: string;
  figure: PoseFigure;
}

const still: Limb = [8, 0];

export const POSE_BANK: readonly PoseChallenge[] = [
  // ---- Reactions
  { id: 'confused', title: 'Confused Face', cue: 'Scratch your head with one hand, shrug with the other and look completely lost.', category: 'Reactions', badge: '😕', figure: { face: 'confused', tilt: 12, armR: [140, 215], armL: [75, 105], legL: still, legR: still } },
  { id: 'shocked', title: 'Shocked Reaction', cue: 'Both hands on your cheeks, eyes wide, mouth open — you just saw something unbelievable.', category: 'Reactions', badge: '😱', figure: { face: 'shocked', lean: -3, armL: [95, 205], armR: [95, 205], legL: still, legR: still } },
  { id: 'laughing', title: 'Laughing Out Loud', cue: 'Hold your belly, throw your head back and laugh until it hurts.', category: 'Reactions', badge: '🤣', figure: { face: 'laugh', lean: -10, tilt: -14, armL: [45, -45], armR: [45, -45], legL: [20, -8], legR: [20, -8] } },
  { id: 'crying', title: 'Crying Dramatically', cue: 'Back of one hand on your forehead, the other arm reaching out. Cry like a movie star.', category: 'Reactions', badge: '😭', figure: { face: 'cry', lean: 5, tilt: 10, armR: [150, 225], armL: [100, 115], legL: [10, 0], legR: [10, 0], props: ['tears'] } },
  { id: 'scared', title: 'Scared Stiff', cue: 'Freeze with both hands up by your face, knees knocking, trembling with fear.', category: 'Reactions', badge: '😨', figure: { face: 'scared', armL: [110, 215], armR: [110, 215], legL: [-8, 6], legR: [-8, 6], props: ['sweat'] } },
  { id: 'angry-stomp', title: 'Angry Stomp', cue: 'Clenched fists, one big stomp — a full toddler tantrum.', category: 'Reactions', badge: '😡', figure: { face: 'angry', lean: -3, armL: [25, 12], armR: [25, 12], legL: [6, 0], legR: [35, -5], props: ['anger'] } },
  // ---- Heroes
  { id: 'superhero', title: 'Superhero Stance', cue: 'Fists on your hips, chest out, chin up. Feel the wind in your cape.', category: 'Heroes', badge: '🦸', figure: { face: 'determined', lean: -2, armL: [60, -40], armR: [60, -40], legL: [26, 10], legR: [26, 10], props: ['cape'] } },
  { id: 'flying-hero', title: 'Flying Superhero', cue: 'Leap forward with one fist stretched ahead and your cape streaming behind you.', category: 'Heroes', badge: '🚀', figure: { face: 'determined', lean: 28, armR: [170, 175], armL: [35, 20], legL: [32, 48], legR: [12, 24], props: ['cape'] } },
  { id: 'muscle-flex', title: 'Muscle Flex', cue: 'Flex both arms, puff out your chest and look very proud of those muscles.', category: 'Heroes', badge: '💪', figure: { face: 'grin', armL: [95, 205], armR: [95, 205], legL: [24, 6], legR: [24, 6], props: ['sparkles'] } },
  { id: 'karate-kick', title: 'Karate Kick', cue: 'Balance on one leg, kick the other out high and keep your hands up, ready to fight.', category: 'Heroes', badge: '🥋', figure: { face: 'determined', lean: -10, armR: [55, 205], armL: [35, 160], legL: [78, 85], legR: [4, 0] } },
  { id: 'victory', title: 'Victory Cheer', cue: 'Both arms in a big V above your head — you just won!', category: 'Heroes', badge: '🙌', figure: { face: 'grin', armL: [155, 165], armR: [155, 165], legL: [14, 4], legR: [14, 4], props: ['stars'] } },
  { id: 't-rex', title: 'T-Rex Roar', cue: 'Tiny arms curled at your chest, lean forward and ROAR.', category: 'Heroes', badge: '🦖', figure: { face: 'roar', lean: 14, tilt: 8, armL: [20, 135], armR: [20, 135], legL: [14, 0], legR: [14, 0] } },
  // ---- Sleepy & Thinking
  { id: 'sleeping', title: 'Sleeping Standing Up', cue: 'Rest your head on your hands as if on a pillow and snore while standing.', category: 'Sleepy & Thinking', badge: '😴', figure: { face: 'sleep', tilt: 24, armR: [70, 205], armL: [-25, 170], legL: [6, 0], legR: [6, 0], props: ['zzz'] } },
  { id: 'yawn', title: 'Big Yawn', cue: 'Cover a huge yawn with one hand while you stretch the other arm out.', category: 'Sleepy & Thinking', badge: '🥱', figure: { face: 'yawn', lean: -6, tilt: -8, armL: [135, 215], armR: [100, 110], legL: still, legR: still } },
  { id: 'thinker', title: 'The Thinker', cue: 'Chin on your fist, other arm across your body — deep in thought.', category: 'Sleepy & Thinking', badge: '🤔', figure: { face: 'think', tilt: 8, armR: [30, 225], armL: [-35, -10], legL: still, legR: still } },
  { id: 'shrug', title: 'Big Shrug', cue: 'Both palms up, shoulders up, eyebrows up — "no idea!"', category: 'Sleepy & Thinking', badge: '🤷', figure: { face: 'meh', tilt: 10, armL: [70, 110], armR: [70, 110], legL: still, legR: still } },
  { id: 'faint', title: 'Dramatic Faint', cue: 'Hand to your forehead, knees wobbling — swoon dramatically.', category: 'Sleepy & Thinking', badge: '😵', figure: { face: 'dizzy', lean: -18, tilt: -18, armR: [140, 222], armL: [40, 22], legL: [15, 0], legR: [-12, 10], props: ['stars'] } },
  // ---- Dance Moves
  { id: 'disco', title: 'Disco Point', cue: 'One arm pointing at the ceiling, hand on hip, swing your hips and strike a disco pose.', category: 'Dance Moves', badge: '🕺', figure: { face: 'cool', lean: -4, armR: [160, 165], armL: [60, -40], legL: [8, 3], legR: [38, 10], props: ['music'] } },
  { id: 'robot', title: 'Robot Dance', cue: 'Stiff right-angle arms and a blank face — beep boop, dance like a robot.', category: 'Dance Moves', badge: '🤖', figure: { face: 'robot', armL: [90, 180], armR: [90, 180], legL: still, legR: still } },
  { id: 'chicken', title: 'Chicken Dance', cue: 'Elbows out, flap your wings, bob your head and squat like a chicken.', category: 'Dance Moves', badge: '🐔', figure: { face: 'silly', armL: [85, 20], armR: [85, 20], legL: [30, -10], legR: [30, -10], props: ['music'] } },
  { id: 'surfer', title: 'Surfer Balance', cue: 'Bend your knees, arms out wide — ride that wave and stay balanced.', category: 'Dance Moves', badge: '🏄', figure: { face: 'cool', lean: 4, armL: [85, 80], armR: [85, 80], legL: [42, -4], legR: [42, -4] } },
  // ---- Attitude
  { id: 'spy', title: 'Sneaky Spy', cue: 'Tiptoe forward in a crouch with one finger on your lips — shhh!', category: 'Attitude', badge: '🕵️', figure: { face: 'wink', lean: 12, tilt: 8, armR: [40, 215], armL: [75, 60], legL: [10, 5], legR: [8, -45] } },
  { id: 'selfie', title: 'Selfie Pose', cue: 'Hold out an imaginary phone, flash a peace sign and pout — selfie time!', category: 'Attitude', badge: '🤳', figure: { face: 'wink', tilt: 15, armR: [125, 135], armL: [55, 205], legL: still, legR: still, props: ['phone'] } },
  { id: 'royal-wave', title: 'Royal Wave', cue: 'Chin up and give a slow elbow-wrist wave, like royalty on a balcony.', category: 'Attitude', badge: '👑', figure: { face: 'smug', tilt: -5, armR: [50, 178], armL: [20, 8], legL: [6, 0], legR: [6, 0], props: ['sparkles'] } },
];

export const poseById = (id: string | undefined): PoseChallenge | undefined => POSE_BANK.find((p) => p.id === id);

// ------------------------------------------------------------------------------------------------ geometry
export const FIGURE_VIEW = { width: 240, height: 300 } as const;
export const SEGMENT = { upperArm: 40, forearm: 38, thigh: 50, shin: 50, torso: 74, neckToHead: 30, headRadius: 26 } as const;

export interface Pt {
  x: number;
  y: number;
}
export interface FigureJoints {
  hip: Pt;
  neck: Pt;
  head: Pt;
  shoulderL: Pt;
  shoulderR: Pt;
  elbowL: Pt;
  handL: Pt;
  elbowR: Pt;
  handR: Pt;
  hipL: Pt;
  hipR: Pt;
  kneeL: Pt;
  footL: Pt;
  kneeR: Pt;
  footR: Pt;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Where every joint of the figure is, in the figure's 240 × 300 picture. L is the left of the picture, R the right. */
export function figureJoints(f: PoseFigure): FigureJoints {
  const hip: Pt = { x: 120, y: 172 };
  const lean = rad(f.lean ?? 0);
  const along = { x: Math.sin(lean), y: -Math.cos(lean) }; // hip → neck
  const across = { x: Math.cos(lean), y: Math.sin(lean) }; // left → right shoulder
  const at = (from: Pt, dir: Pt, len: number): Pt => ({ x: from.x + dir.x * len, y: from.y + dir.y * len });
  const neck = at(hip, along, SEGMENT.torso);
  const mid = at(hip, along, SEGMENT.torso - 8);
  const shoulderL = at(mid, across, -15);
  const shoulderR = at(mid, across, 15);
  const tilt = rad((f.lean ?? 0) + (f.tilt ?? 0));
  const head = { x: neck.x + Math.sin(tilt) * SEGMENT.neckToHead, y: neck.y - Math.cos(tilt) * SEGMENT.neckToHead };
  // limb segment: `deg` is measured from straight down, outward = away from the body's middle line (so the left side mirrors)
  const seg = (from: Pt, deg: number, len: number, side: -1 | 1): Pt => ({ x: from.x + side * Math.sin(rad(deg)) * len, y: from.y + Math.cos(rad(deg)) * len });
  const elbowL = seg(shoulderL, f.armL[0], SEGMENT.upperArm, -1);
  const elbowR = seg(shoulderR, f.armR[0], SEGMENT.upperArm, 1);
  const hipL = { x: hip.x - 10, y: hip.y };
  const hipR = { x: hip.x + 10, y: hip.y };
  const kneeL = seg(hipL, f.legL[0], SEGMENT.thigh, -1);
  const kneeR = seg(hipR, f.legR[0], SEGMENT.thigh, 1);
  return {
    hip,
    neck,
    head,
    shoulderL,
    shoulderR,
    elbowL,
    handL: seg(elbowL, f.armL[1], SEGMENT.forearm, -1),
    elbowR,
    handR: seg(elbowR, f.armR[1], SEGMENT.forearm, 1),
    hipL,
    hipR,
    kneeL,
    footL: seg(kneeL, f.legL[1], SEGMENT.shin, -1),
    kneeR,
    footR: seg(kneeR, f.legR[1], SEGMENT.shin, 1),
  };
}
