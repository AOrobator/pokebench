# How keepingiticy's RNG manipulation works

There are two manipulations in the run: the starter Mudkip (frame 5822) and the one-ball Rayquaza catch. Neither goes into our training. This is here so you know what they are.

## ELI5

The game has a dice machine inside it. It doesn't really roll dice. It reads from a very long list of numbers that is always the same list, in the same order. Every time the TV screen refreshes (60 times a second), the game moves one step down the list.

When you pick your starter, the game reads the next few numbers on the list, and they decide how strong your Mudkip is. So if you pick it at exactly the right moment, you always get the same super-strong Mudkip.

Emerald starts at the top of the list every time you turn it on. So keepingiticy saves, turns the game off and on, and uses a stopwatch to press A at exactly the right moment, 5,822 steps down the list. If it doesn't work, he resets and tries again.

Rayquaza works the same way. A Poké Ball on a full-health Rayquaza almost never works. But he saved right in front of it, so he can time the throw for the moment the list says "caught".

## ELI software engineer

**The generator.** Gen 3 uses a 32-bit linear congruential generator:

```
seed = (seed * 0x41C64E6D + 0x6073) mod 2^32
rand() = seed >> 16          // 16-bit output
```

**Emerald's bug.** Ruby and Sapphire seed this from the real-time clock. Emerald seeds it with **0 on every boot**. So the sequence after power-on (or soft reset) is identical every time, and the state is just "how many times has rand() been called since boot".

**Advancement.** The game calls rand() once per frame in the main loop (about 59.73 fps), plus extra calls from some events (NPC movement, some menus). A run that does the same inputs on the same frames makes the same extra calls, so "frame N" is effectively a fixed index into the sequence.

**Pokémon generation ("Method 1").** When the starter is created, the game draws four values in a row:
1. PID low 16 bits
2. PID high 16 bits. Nature = PID mod 25, and the PID also sets gender, ability slot and shininess.
3. IVs: HP / Attack / Defense, 5 bits each
4. IVs: Speed / Sp. Atk / Sp. Def, 5 bits each

So the whole Pokémon is a pure function of the index. You can precompute the table offline (that's what https://spo.ink/5822 is) and pick a target. His target is **index 5822**: Lonely nature, IVs 25/28/31/30/22/27. That's high Attack at the cost of Defense; Lonely is +Atk −Def.

**Hitting it.** 5822 frames ≈ 97.5 s after boot. In the video he saves in the bedroom, resets (the © screen is at 0:02:16), and picks Mudkip at 0:03:49. That's about 93–95 s of video, which fits once you count the boot frames. The inputs in between follow a fixed script, and he times the final A press with a timer. If he misses, he checks the Mudkip's stats, resets and repeats. The save exists so that each retry is short and starts from an identical state.

**The Rayquaza catch.** The Gen 3 catch formula:

```
a = ((3*maxHP - 2*HP) * catchRate * ballBonus) / (3*maxHP)
```

Rayquaza's catch rate in Gen 3 is 3. At full HP with a Poké Ball (bonus 1): a = 1. Each of the four shake checks then passes with about 16,400 / 65,536 ≈ 25%, so all four pass about **0.4%** of the time. (I computed this from the formula. An earlier note of mine said 2–3%; that was wrong.)

He saved at the Sky Pillar summit (in-game 2:01). From that save, the same timing from reset → walk-up → battle → ball throw gives the same shake rolls. So the 0.4% throw becomes a scripted one.

## What this means for us

- **Keep both out of training** (already a curriculum rule). Our lane gets a normal starter and the Master Ball for Rayquaza.
- **Our emulator is just as deterministic.** The same save plus the same inputs on the same frames gives the same game. That's why replaying a recorded trajectory reproduces it exactly, and why run-to-run differences in our benchmark come from the model's choices and timing, not from luck in the game.
- **Don't confuse this with the tactics we do want.** X Attacks, Guard Spec and the sacrifice lead work without any RNG. Only the starter and the catch rely on it.
