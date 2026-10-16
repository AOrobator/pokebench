// Game tile rules shared by navigation and press results.
export type Direction="UP"|"DOWN"|"LEFT"|"RIGHT";
// pokeemerald 731ad5b MB_JUMP_EAST/WEST/NORTH/SOUTH: collision tiles that one press
// in their direction jumps over, landing two tiles on (GetLedgeJumpDirection).
export const LEDGES:ReadonlyMap<number,Direction>=new Map([[0x38,"RIGHT"],[0x39,"LEFT"],[0x3a,"UP"],[0x3b,"DOWN"]]);
// pokeemerald 731ad5b MetatileBehavior_Is*Blocked: collision-free tiles whose listed sides
// IsMetatileDirectionallyImpassable refuses to cross, leaving the current tile or entering the next.
export const EDGE_WALLS:ReadonlyMap<number,readonly Direction[]>=new Map([[0x30,["RIGHT"]],[0x31,["LEFT"]],[0x32,["UP"]],[0x33,["DOWN"]],[0x34,["UP","RIGHT"]],[0x35,["UP","LEFT"]],[0x36,["DOWN","RIGHT"]],[0x37,["DOWN","LEFT"]],[0xbe,["LEFT","RIGHT"]],[0xc0,["UP","DOWN"]],[0xc1,["LEFT","RIGHT"]]]);
export const COUNTER=0x80;
export const OPPOSITE:Readonly<Record<Direction,Direction>>={UP:"DOWN",DOWN:"UP",LEFT:"RIGHT",RIGHT:"LEFT"};
// pokeemerald IsElevationMismatchAt / ObjectEventUpdateElevation: 0 is a
// transition (stairs) and 15 is multi-level (bridges); neither ever mismatches.
// A finished step or jump re-reads only its final tile, which sets the walker's
// height unless that tile is 15. A jump also updates mid-air on the ledge tile
// (InitJump, then JUMP_HALFWAY), and a 15 landing keeps that update.
export const MULTI_LEVEL=15;
export interface ElevationRule {readonly mismatch:(walker:number,tile:number)=>boolean;readonly entered:(walker:number,tile:number)=>number;readonly jumped:(walker:number,takeoff:number,ledge:number,landing:number)=>number}
export const GAME_RULE:ElevationRule={
 mismatch:(walker,tile)=>walker!==0&&tile!==0&&tile!==MULTI_LEVEL&&tile!==walker,
 entered:(walker,tile)=>tile===MULTI_LEVEL?walker:tile,
 jumped:(walker,takeoff,ledge,landing)=>landing!==MULTI_LEVEL?landing:takeoff===MULTI_LEVEL?walker:GAME_RULE.entered(walker,ledge),
};
// TILE_FLAG_SURFABLE water: not walkable on foot.
export const WATER=new Set([0x10,0x11,0x12,0x13,0x14,0x15,0x19,0x22,0x2a,0x50,0x51,0x52,0x53,0x6c,0x6d,0x6f]);
