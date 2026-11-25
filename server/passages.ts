import type { Difficulty } from '../shared/difficulty';

// Easy Typing passages: simple everyday words, short sentences (3 sentences, ~135–155 chars), beginner-friendly vocabulary.
export const EASY_PASSAGES: readonly string[] = [
  'The bright sun warms the quiet park today. Kids run across the green grass and laugh together. A small dog chases a red ball near the tall oak tree.',
  'A blue car drives down the wide country road. Soft clouds float across the clear summer sky. Cool wind blows through the open window all afternoon.',
  'Fresh bread bakes inside the warm kitchen oven. Milk sits in a tall glass beside a clean plate. Soon the whole family will sit down to eat lunch.',
  'Rain taps softly on the glass window at night. A yellow lamp glows beside a good story book. The sleepy cat curls up on a soft blanket to rest.',
  'Small waves roll onto the warm sandy beach. White birds fly low above the calm blue water. Two friends walk along the shore and look for shells.',
  'The fast train stops at the busy town station. People step onto the platform with small bags. A bell rings once, and the train moves forward again.',
  'Green frogs sit on flat stones near the pond. Clear water shines under the bright morning light. Tall reeds sway gently each time the breeze passes.',
  'Every player on the team wears a clean shirt. They pass the ball quickly across the wide field. Loud cheers fill the stands when they score a goal.',
  'Snow falls quietly over the little wooden house. Warm smoke rises from the stone chimney top. Inside, hot soup simmers in a big pot on the stove.',
  'A young girl plants flower seeds in brown soil. She pours cool water from a small green can. Week by week, bright red petals open in the sun.',
  'Five boats rest beside the wooden dock at dawn. Fishermen pack nets and ropes into each hull. They row out smoothly onto the calm silver lake.',
  'Stars shine high above the quiet camp tonight. Pine trees stand dark around the glowing fire. Everyone shares songs and warm tea before bed.',
];

// Race passages (Medium Typing default). Plain ASCII (letters, spaces, commas, periods) so they are typeable on any phone keyboard.
// Each is two sentences, 300–350 characters (about 60–70 words). #0 opens with the exact passage shown in the reel
// (its first 150 characters); the rest of it is ours. Tests enforce length, charset and uniqueness.
export const PASSAGES: readonly string[] = [
  'Carved by monumental glacial ice over thousands of years, emerald waters wind between towering vertical cliffs lined with roaring mountain waterfalls. Travelers drift slowly through the fjord in small boats, pointing at rainbows in the spray, while eagles circle overhead and the late sun paints the stone walls gold before the blue evening arrives.',
  'The morning train slid out of the quiet station while steam curled over the platform, and every passenger watched the golden fields slowly wake beneath a pale pink sky. By the time the conductor came through with tickets, the farms had given way to rivers and bridges, and a sleepy child pressed a hand against the cold window to wave at every cow.',
  'Deep in the forest a narrow stream tumbles over mossy stones, carrying fallen leaves toward a hidden lake where herons stand perfectly still and wait for breakfast. Nearby, a family of otters slides down the muddy bank, a woodpecker taps out a steady rhythm on a pine, and the whole valley seems to hold its breath until the sun reaches the water.',
  'Engineers gathered around the glowing screens, tested every line of code twice, and finally launched the update just before sunrise while the whole city was still asleep. Nobody cheered at first, because the numbers had to stay green for an hour, but when the dashboard turned calm, someone brought out coffee and the team finally laughed together.',
  'A small fishing boat rocked gently beside the old harbor wall as seagulls circled above the market, hoping for scraps from the fresh catch of the early morning. The fishermen sorted fish into crates, called out prices across the stones, and traded jokes with the bakers who carried warm loaves down from the hill before the first tourists woke.',
  'High above the desert, the night sky filled with countless bright stars, and the travelers lay quietly on warm sand, listening to the soft wind move across the dunes. One of them pointed out a satellite, another named the constellations her grandfather had taught her, and for a while nobody spoke, because the silence felt larger than any story.',
  'Every great team begins with a simple idea, a few curious people, and enough courage to try again after the first plan falls apart on a rainy and exhausting afternoon. They learn to share the credit and the blame, to ask for help without feeling small, and to celebrate small wins, because they are the steps that carry everyone to the finish line.',
  'The old lighthouse keeper climbed the spiral stairs every evening, lit the great lamp, and watched its beam sweep across the dark water to guide ships safely home. Storms came and went, and sailors changed with the years, yet the keeper kept the same careful routine, polishing the glass until it shone and writing every vessel into a worn notebook.',
  'Fresh snow covered the mountain village overnight, and children rushed outside with sleds while smoke rose from every chimney and the bakery filled the street with warm bread. By noon the hill behind the church was a ribbon of laughter, the teacher gave up on lessons, and even the shopkeeper stood at his door with cocoa, smiling at the noise.',
  'Racing through the narrow canyon, the explorers followed a trail of tiny footprints that vanished beneath a curtain of vines, leading them toward a secret waterfall. Behind the veil they found a quiet pool glowing turquoise in the shade, and they sat on the smooth rocks to rest, amazed that something so beautiful had stayed hidden for so long.',
  'On the last Friday of the month the whole office stops early, pushes the desks together, and shares snacks while somebody tells the story of the very first product launch. New teammates listen as the veterans describe the late nights, the broken demos, and the customer who sent a thank you note that everyone keeps pinned above the kitchen sink.',
  'Thunder rolled across the wide valley as bright lightning lit the clouds, and the farmers hurried the last of the cattle into the barn before the heavy rain arrived. Inside, the lamps were lit, the kettle began to sing, and the children counted the seconds between flash and rumble, certain that the storm would pass before the bread was ready.',
  'A patient gardener planted tiny seeds along the sunny wall, watered them each dawn, and months later found a rainbow of tall flowers swaying proudly in the summer breeze. Bees arrived in the first week, butterflies followed soon after, and the neighbors began to stop at the gate, asking how anyone could grow something so cheerful from so little.',
  'Cruising along the coast road with the windows down, she watched the bright blue ocean sparkle, hummed her favorite song, and forgot every deadline for one perfect hour. The road curled past small villages, a roadside stand sold sweet peaches, and when the sun began to set she parked at a lookout, grateful that she had taken the long way home.',
];

export const MEDIUM_PASSAGES: readonly string[] = PASSAGES;

// Hard Typing passages: longer passages (~365–425 chars) with complex vocabulary, numbers, varied punctuation, and standard ASCII special characters.
export const HARD_PASSAGES: readonly string[] = [
  'At 04:15 UTC, telemetry cluster #7 flagged a 99.98% throughput spike (14,200 req/s) across our distributed microservices! Could the load-balancer handle 3x asymmetric traffic without cascading latency? Engineers recalibrated cache-eviction thresholds, verified SHA-256 cryptographic handshakes @ edge-node-42, & restored sub-12ms equilibrium; zero packets dropped.',
  'Flight-control diagnostics report #309: hypersonic prototype "Valkyrie-IX" sustained Mach 4.6 @ 28,500m while external thermal sensors logged +1,140C! Although turbulent crosswinds challenged aerodynamic stability (yaw variance: +/-0.35%), the autonomous guidance algorithm recalculated 120 trajectories/sec & executed a flawless touchdown on Runway 24L.',
  'During Q4-2026 reconciliation, quantitative analysts audited $48.75M in cross-border settlements (EUR/USD & GBP/JPY) under a strict 0.001% variance policy! Whenever irregular ledger hashes appeared @ batch #819, automated compliance pipelines cross-checked 64-bit timestamps; within 18.4 seconds, every cryptographic signature matched 100% of archival records.',
  'Observatory bulletin #512 (23:47:09 UTC): high-resolution spectroscopy from Array-7B detected exoplanet "Kepler-442x" orbiting at 0.38 AU! Did atmospheric absorption lines confirm H2O & CH4 concentrations above 1.75%? Astrophysicists cross-referenced 3,600 interferometric frames, eliminated +/-2.4% background noise, & published verified coordinates @ 14h29m.',
  'PostgreSQL shard #16 experienced unexpected lock-contention (p99 latency > 485ms @ 82% CPU utilization) during Friday\'s schema migration! Rather than halting 24/7 checkout pipelines ($19,400/min revenue), database architects deployed non-blocking concurrent indexes, tuned work_mem = 256MB, & slashed query execution time by 91.6%; uptime stayed at 99.99%.',
  'Submersible "Nautilus-4" descended 3,850m into hydrothermal vent field #19, where titanium pressure-hulls endure 385+ atmospheres & 340C mineral plumes! Using dual-frequency sonar (75kHz / 210kHz), marine geophysicists mapped 14.2km of uncharted basalt fissures; amazingly, chemosynthetic ecosystems thrived @ pH 2.8 without a single photon of sunlight.',
  'Cybersecurity advisory #2026-88: zero-trust authentication gateways blocked 17,450 credential-stuffing attempts/min targeting API endpoint /v3/oauth/token! How did polymorphic signatures bypass legacy firewall rules (#104 & #209)? Incident-response specialists isolated compromised subnets, rotated 4,096-bit RSA keys @ 02:30, & enforced hardware FIDO2 tokens.',
  'Inside cleanroom Facility-B9 (ISO Class 3: <1,000 particles/m3), ultraviolet lithography scanners etch 2nm transistor architectures onto 300mm silicon wafers! Even a 0.05-micron vibration disrupts sub-nanometer alignment; therefore, pneumatic isolation stages compensate @ 5,000Hz, boosting die yield from 78.4% to 94.2% & cutting power draw by $0.18/watt.',
  'Quantum-annealing benchmark #64: superconducting qubits chilled to 15 millikelvins (-273.135C) solved a 1,024-node combinatorial routing puzzle in 8.7ms! Classical heuristics required 42+ minutes @ 96 cores; however, decoherence & electromagnetic crosstalk still demand rigorous error-correction codes (surface-code distance = 11) before commercial deployment.',
  'High-speed rail corridor "Shinkansen-E9" dispatches 16-car formations every 180 seconds, maintaining +/-5s chronometer precision across 515.4km of viaducts! If seismometers detect P-wave accelerations >= 40 gal (@ station #31), regenerative eddy-current brakes engage automatically & decelerate 710-ton consists from 320km/h down to 0km/h without wheel slip.',
  'Biopharmaceutical reactor #42 synthesizes monoclonal antibodies under automated PID orchestration: dissolved O2 = 45.0%, agitation @ 185 RPM, & temperature locked at 36.8C (+/-0.1C)! Real-time Raman spectroscopy samples metabolic byproducts every 90s; should glucose drop below 2.5 g/L, peristaltic pumps dispense sterile nutrient feed #7B within 250ms.',
  'Compiler optimization pass #13 ("loop-vectorize + inline") transformed 84,500 lines of Rust/C++ simulation code into SIMD AVX-512 instructions! Benchmark suite v4.2.1 confirmed a +63.8% speedup (from 19.4ms down to 7.02ms/frame @ 144Hz) while memory-sanitizer checks reported 0 leaks, 0 race conditions, & 100% deterministic floating-point reproducibility.',
];

export const PASSAGES_BY_DIFFICULTY: Record<Difficulty, readonly string[]> = {
  easy: EASY_PASSAGES,
  medium: MEDIUM_PASSAGES,
  hard: HARD_PASSAGES,
};

export function passagesFor(difficulty: Difficulty): readonly string[] {
  return PASSAGES_BY_DIFFICULTY[difficulty];
}
