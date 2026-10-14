# Validated Emerald Pokémon decoding

Source: pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`; exact US ROM SHA-1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7`. Reference checkout was clean and remained read-only. `include/pokemon.h` owns the 80-byte BoxPokemon/100-byte party layout, shuffled 12-byte secure substructures, egg flags, status and party statistics. `src/pokemon.c` owns XOR encryption, the 24-halfword checksum, and in-place Get/SetBoxMonData lifetimes.

The previous reader always XOR-decrypted a species word without checking the checksum. The game temporarily decrypts its own secure bytes in RAM while reading them, so a snapshot taken inside that interval was XORed twice and emitted an impossible species. The new owned decoder checks the entire secure checksum in both representations, validates species/egg flags, level/HP/status, held-item table ID/name, all four moves and PP against the exact ROM move table, and preserves personality/OT identity. Party slots are read in one contiguous RAM read. PC BoxMon slots reuse the same decoder, with level/HP/status left unavailable because these fields are absent from storage.

Missing, corrupt, mixed or genuinely unqualified data produces an explicit `harness bug: Pokémon ...` diagnostic with bounded 80/100-byte evidence; it never invents a species label. Activity consumers must skip such snapshots and retain their diagnostic rather than treating missing data as a capture, evolution or move change. This is an error path requiring repair, not successful coverage.

Two checksums can legitimately match (for example XOR key `0x80008000`). The decoder fully validates both candidates and accepts a unique fully valid candidate. If both layouts are valid, atomic CPU context establishes representation. `PokemonCpu` contains the 16 registers, CPSR, stack address and bounded stack bytes, read under the existing emulator snapshot lock. The finite resolver binds the exact BoxMon address and verified Get/SetBoxMonData instructions, helper prologues and saved-return offsets. It does not select plaintext merely because an arbitrary return address appears somewhere on a stack. IRQ/banked-register contexts, crypto loops or unqualified stack frames remain explicit errors when representation is ambiguous.

Exact-ROM instruction mapping:

- EncryptBoxMon `0x0806A228`; DecryptBoxMon `0x0806A24C`; GetSubstruct `0x0806A270`; checksum `0x08068C78`.
- GetBoxMonData `0x0806A674`: decrypt call `0x0806A6C6`, checksum call `0x0806A6CC`, encrypt call `0x0806AC94`; BoxMon pointer in R8 and field at SP.
- SetBoxMonData `0x0806AD9C`: decrypt `0x0806ADEC`, checksum `0x0806ADF2`/`0x0806B3E0`, encrypt `0x0806B3E8`; pointer in R7 and field in R10.
- Unsigned-modulo helper `0x082E7BE0`; GetSubstruct call return `0x0806A283`. Its single pushed R4 changes saved-return offsets by four bytes.
- gMoveNames `0x0831977C`, stride 13; gBattleMoves `0x0831C898`, stride 12/PP offset 4. All 355 PP values match the pinned source table.
- gItems `0x085839A0`, stride 44, item ID offset 14. The unique MASTER BALL name at `0x085839CC`, row ID 1 and adjacent ULTRA BALL establish this table; resources qualification also checks every row ID.
- gPokemonStoragePtr `0x03005D94`: GetCurrentBox `0x080D1D0C` loads this literal at `0x080D1D14` and reads byte zero. Adjacent SetCurrentBox at `0x080D1D18` checks box <=13 then writes byte zero through the same pointer literal. An owned native snapshot read pointer `0x02029850` and zero current-box header.

## Native proof and regression checks

`runs/pokemon-decoding-proof/proof.json` is an explicitly non-benchmark manual probe. It loads the immutable existing intro state into an independent mGBA core and uses ordinary recorded buttons through starter selection and the first battle. It does not control, reload or write RAM in any measured run/server/model. Source/ROM/save hashes, every input interval, raw Pokémon bytes, CPU context, paired PNG and exact production readout are retained. `starter-menu.state` and `post-starter.state` are snapshots of this owned probe for further reader qualification, not edits to save/RAM data.

Across 2,614 party-frame reads, the old decoder produced one impossible/wrong species; the new decoder produced zero diagnostics. At probe frame 9,783, the old species ID was 61,358; the new decoder returned the checksum-proven real species MUDKIP (283), level 5, HP 20/20, Tackle/Growl. CPU PC `0x082E7C54`, LR `0x0806A283`, R5/R8 `0x020244EC`, saved GetSubstruct return at SP+16 and checksum caller return `0x0806A6D1` at SP+40 independently prove the plaintext lifetime. The finite owner resolver reports encrypted on frame 9,628 and plaintext on 9,783.

69 focused decoder cases cover all shuffle orders in both representations, actual native raw bytes, checksum corruption, eggs, out-of-range species/moves/items, actual PP limits, BoxMon semantics, legal ambiguous keys, exact CPU owner/unwind selection, wrong-slot binding, stale stack, IRQ contexts and transition prologues. Decoder statement/branch coverage is 100%. Isolated mutations removing plaintext checksum support or changing the checksum caller stack offset fail the corresponding behavioral regression checks; no shared production files were mutated.

This proves the observed failure class in native gameplay. The historical human log did not retain the 29 failing samples' raw secure bytes or CPU registers, so their exact species cannot be reconstructed retrospectively from those samples alone. Partial writer/IRQ ambiguity retains diagnostic evidence and remains a harness defect if encountered; it is not silently declared decoded.
