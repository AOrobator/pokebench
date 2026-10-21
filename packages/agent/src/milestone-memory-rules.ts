// Exact delivered text templates audited against pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881.
// No run IDs, ages, fuzzy text matching or extracted objectives. Unknown variants stay.
export interface RetirementRule {readonly id:string;readonly source:readonly string[];readonly requires:readonly string[];readonly pages:readonly {readonly text:string;readonly map_id:readonly number[]|null;readonly speaker:string|null;readonly speaker_source:string|null}[]}
export const RETIREMENT_RULES:readonly RetirementRule[] = [
 {
  "id": "home-clock",
  "source": [
   "data/maps/LittlerootTown/scripts.inc",
   "data/scripts/players_house.inc"
  ],
  "requires": [
   "CLOCK_SET"
  ],
  "pages": [
   {
    "text": "MOM: {PLAYER}, we're here, honey!",
    "map_id": [
     0,
     9
    ],
    "speaker": "MOM",
    "speaker_source": "name_prefix"
   },
   {
    "text": "It must be tiring riding with our things\nin the moving truck.",
    "map_id": [
     0,
     9
    ],
    "speaker": "MOM",
    "speaker_source": "name_prefix"
   },
   {
    "text": "Well, this is LITTLEROOT TOWN.",
    "map_id": [
     0,
     9
    ],
    "speaker": "MOM",
    "speaker_source": "name_prefix"
   },
   {
    "text": "How do you like it?\nThis is our new home!",
    "map_id": [
     0,
     9
    ],
    "speaker": "MOM",
    "speaker_source": "name_prefix"
   },
   {
    "text": "It has a quaint feel, but it seems to be\nan easy place to live, don't you think?",
    "map_id": [
     0,
     9
    ],
    "speaker": "MOM",
    "speaker_source": "name_prefix"
   },
   {
    "text": "And, you get your own room, {PLAYER}!\nLet's go inside.",
    "map_id": [
     0,
     9
    ],
    "speaker": "MOM",
    "speaker_source": "name_prefix"
   },
   {
    "text": "MOM: See, {PLAYER}?\nIsn't it nice in here, too?",
    "map_id": [
     1,
     0
    ],
    "speaker": "MOM",
    "speaker_source": "name_prefix"
   },
   {
    "text": "The mover's POKéMON do all the work\nof moving us in and cleaning up after.\nThis is so convenient!",
    "map_id": [
     1,
     0
    ],
    "speaker": "MOM",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "{PLAYER}, your room is upstairs.\nGo check it out, dear!",
    "map_id": [
     1,
     0
    ],
    "speaker": "MOM",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "DAD bought you a new clock to mark\nour move here.\nDon't forget to set it!",
    "map_id": [
     1,
     0
    ],
    "speaker": "MOM",
    "speaker_source": "faced_sprite"
   }
  ]
 },
 {
  "id": "clock-request",
  "source": [
   "data/scripts/players_house.inc"
  ],
  "requires": [
   "CLOCK_SET"
  ],
  "pages": [
   {
    "text": "The clock is stopped…",
    "map_id": [
     1,
     1
    ],
    "speaker": "Wall clock",
    "speaker_source": "faced_target"
   },
   {
    "text": "Better set it and start it!",
    "map_id": [
     1,
     1
    ],
    "speaker": "Wall clock",
    "speaker_source": "faced_target"
   }
  ]
 },
 {
  "id": "tv-birch-introduction",
  "source": [
   "data/scripts/players_house.inc"
  ],
  "requires": [
   "BIRCH_STARTER_HANDOFF_COMPLETE"
  ],
  "pages": [
   {
    "text": "MOM: Oh! {PLAYER}, {PLAYER}!\nQuick! Come quickly!",
    "map_id": [
     1,
     0
    ],
    "speaker": "MOM",
    "speaker_source": "name_prefix"
   },
   {
    "text": "MOM: Look! It's PETALBURG GYM!\nMaybe DAD will be on!",
    "map_id": [
     1,
     0
    ],
    "speaker": "MOM",
    "speaker_source": "name_prefix"
   },
   {
    "text": "INTERVIEWER: …We brought you this\nreport from in front of PETALBURG GYM.",
    "map_id": [
     1,
     0
    ],
    "speaker": "INTERVIEWER",
    "speaker_source": "name_prefix"
   },
   {
    "text": "MOM: Oh… It's over.",
    "map_id": [
     1,
     0
    ],
    "speaker": "MOM",
    "speaker_source": "name_prefix"
   },
   {
    "text": "I think DAD was on, but we missed him.\nToo bad.",
    "map_id": [
     1,
     0
    ],
    "speaker": "MOM",
    "speaker_source": "name_prefix"
   },
   {
    "text": "Oh, yes.\nOne of DAD's friends lives in town.",
    "map_id": [
     1,
     0
    ],
    "speaker": "MOM",
    "speaker_source": "name_prefix"
   },
   {
    "text": "PROF. BIRCH is his name.",
    "map_id": [
     1,
     0
    ],
    "speaker": "MOM",
    "speaker_source": "name_prefix"
   },
   {
    "text": "He lives right next door, so you should\ngo over and introduce yourself.",
    "map_id": [
     1,
     0
    ],
    "speaker": "MOM",
    "speaker_source": "name_prefix"
   }
  ]
 },
 {
  "id": "rival-upstairs",
  "source": [
   "data/maps/LittlerootTown_MaysHouse_1F/scripts.inc"
  ],
  "requires": [
   "RIVAL_MET"
  ],
  "pages": [
   {
    "text": "Oh, hello. And you are?",
    "map_id": [
     1,
     2
    ],
    "speaker": "WOMAN_4",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "… … … … … … … … …\n… … … … … … … … …",
    "map_id": [
     1,
     2
    ],
    "speaker": "WOMAN_4",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Oh, you're {PLAYER}, our new next-door\nneighbor! Hi!",
    "map_id": [
     1,
     2
    ],
    "speaker": "WOMAN_4",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "We have a daughter about the same\nage as you.",
    "map_id": [
     1,
     2
    ],
    "speaker": "WOMAN_4",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Our daughter was excited about making\na new friend.",
    "map_id": [
     1,
     2
    ],
    "speaker": "WOMAN_4",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Our daughter is upstairs, I think.",
    "map_id": [
     1,
     2
    ],
    "speaker": "WOMAN_4",
    "speaker_source": "faced_sprite"
   }
  ]
 },
 {
  "id": "rival-introduction",
  "source": [
   "data/maps/LittlerootTown_MaysHouse_1F/scripts.inc"
  ],
  "requires": [
   "RIVAL_MET"
  ],
  "pages": [
   {
    "text": "Huh?\nWho… Who are you?",
    "map_id": [
     1,
     2
    ],
    "speaker": "RIVAL_MAY_NORMAL",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "… … … … … … … …\n… … … … … … … …",
    "map_id": [
     1,
     2
    ],
    "speaker": "RIVAL_MAY_NORMAL",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Oh, you're {PLAYER}.\nSo your move was today.",
    "map_id": [
     1,
     2
    ],
    "speaker": "RIVAL_MAY_NORMAL",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Um… I'm MAY.\nGlad to meet you!",
    "map_id": [
     1,
     2
    ],
    "speaker": "RIVAL_MAY_NORMAL",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "I…\nI have this dream of becoming friends\nwith POKéMON all over the world.",
    "map_id": [
     1,
     2
    ],
    "speaker": "RIVAL_MAY_NORMAL",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "I… I heard about you, {PLAYER}, from\nmy dad, PROF. BIRCH.",
    "map_id": [
     1,
     2
    ],
    "speaker": "RIVAL_MAY_NORMAL",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "I was hoping that you would be nice,\n{PLAYER}, and that we could be friends.",
    "map_id": [
     1,
     2
    ],
    "speaker": "RIVAL_MAY_NORMAL",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Oh, this is silly, isn't it?\nI… I've just met you, {PLAYER}.",
    "map_id": [
     1,
     2
    ],
    "speaker": "RIVAL_MAY_NORMAL",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Eheheh…",
    "map_id": [
     1,
     2
    ],
    "speaker": "RIVAL_MAY_NORMAL",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Oh, no! I forgot!",
    "map_id": [
     1,
     2
    ],
    "speaker": "RIVAL_MAY_NORMAL",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "I was supposed to go help Dad catch\nsome wild POKéMON!",
    "map_id": [
     1,
     2
    ],
    "speaker": "RIVAL_MAY_NORMAL",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "{PLAYER}, I'll catch you later!",
    "map_id": [
     1,
     2
    ],
    "speaker": "RIVAL_MAY_NORMAL",
    "speaker_source": "faced_sprite"
   }
  ]
 },
 {
  "id": "birch-fieldwork",
  "source": [
   "data/maps/LittlerootTown_ProfessorBirchsLab/scripts.inc"
  ],
  "requires": [
   "BIRCH_STARTER_HANDOFF_COMPLETE"
  ],
  "pages": [
   {
    "text": "Hunh? PROF. BIRCH?",
    "map_id": [
     1,
     4
    ],
    "speaker": "SCIENTIST_1",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "The PROF's away on fieldwork.\nErgo, he isn't here.",
    "map_id": [
     1,
     4
    ],
    "speaker": "SCIENTIST_1",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Oh, let me explain what fieldwork is.",
    "map_id": [
     1,
     4
    ],
    "speaker": "SCIENTIST_1",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "It is to study things in the natural\nenvironment, like fields and mountains,\ninstead of a laboratory.",
    "map_id": [
     1,
     4
    ],
    "speaker": "SCIENTIST_1",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "The PROF isn't one for doing desk work.\nHe's the type of person who would\nrather go outside and experience\nthings than read about them here.",
    "map_id": [
     1,
     4
    ],
    "speaker": "SCIENTIST_1",
    "speaker_source": "faced_sprite"
   }
  ]
 },
 {
  "id": "town-rescue-request",
  "source": [
   "data/maps/LittlerootTown/scripts.inc"
  ],
  "requires": [
   "BIRCH_RESCUE_COMPLETE"
  ],
  "pages": [
   {
    "text": "Um, hi!",
    "map_id": [
     0,
     9
    ],
    "speaker": "TWIN",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "There are scary POKéMON outside!\nI can hear their cries!",
    "map_id": [
     0,
     9
    ],
    "speaker": "TWIN",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "I want to go see what's going on,\nbut I don't have any POKéMON…",
    "map_id": [
     0,
     9
    ],
    "speaker": "TWIN",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Can you go see what's happening\nfor me?",
    "map_id": [
     0,
     9
    ],
    "speaker": "TWIN",
    "speaker_source": "faced_sprite"
   }
  ]
 },
 {
  "id": "birch-rescue-request",
  "source": [
   "data/maps/Route101/scripts.inc"
  ],
  "requires": [
   "BIRCH_RESCUE_COMPLETE"
  ],
  "pages": [
   {
    "text": "H-help me!",
    "map_id": [
     0,
     16
    ],
    "speaker": null,
    "speaker_source": null
   },
   {
    "text": "Hello! You over there!\nPlease! Help!",
    "map_id": [
     0,
     16
    ],
    "speaker": null,
    "speaker_source": null
   },
   {
    "text": "In my BAG!\nThere's a POKé BALL!",
    "map_id": [
     0,
     16
    ],
    "speaker": null,
    "speaker_source": null
   }
  ]
 },
 {
  "id": "birch-handoff",
  "source": [
   "data/maps/Route101/scripts.inc",
   "data/maps/LittlerootTown_ProfessorBirchsLab/scripts.inc"
  ],
  "requires": [
   "BIRCH_STARTER_HANDOFF_COMPLETE"
  ],
  "pages": [
   {
    "text": "PROF. BIRCH: Whew…",
    "map_id": [
     0,
     16
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "I was in the tall grass studying wild\nPOKéMON when I was jumped.",
    "map_id": [
     0,
     16
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "You saved me.\nThanks a lot!",
    "map_id": [
     0,
     16
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "Oh?",
    "map_id": [
     0,
     16
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "Hi, you're {PLAYER}!",
    "map_id": [
     0,
     16
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "This is not the place to chat, so come\nby my POKéMON LAB later, okay?",
    "map_id": [
     0,
     16
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "PROF. BIRCH: So, {PLAYER}.",
    "map_id": [
     1,
     4
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "I've heard so much about you from\nyour father.",
    "map_id": [
     1,
     4
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "I've heard that you don't have your\nown POKéMON yet.",
    "map_id": [
     1,
     4
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "But the way you battled earlier,\nyou pulled it off with aplomb!",
    "map_id": [
     1,
     4
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "I guess you have your father's blood\nin your veins after all!",
    "map_id": [
     1,
     4
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "Oh, yes. As thanks for rescuing me,\nI'd like you to have the POKéMON you\nused earlier.",
    "map_id": [
     1,
     4
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "{PLAYER} received the TORCHIC!",
    "map_id": [
     1,
     4
    ],
    "speaker": null,
    "speaker_source": null
   },
   {
    "text": "PROF. BIRCH: While you're at it, why not\ngive a nickname to that TORCHIC?",
    "map_id": [
     1,
     4
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   }
  ]
 },
 {
  "id": "birch-see-may",
  "source": [
   "data/maps/LittlerootTown_ProfessorBirchsLab/scripts.inc"
  ],
  "requires": [
   "RIVAL_BATTLE_WON"
  ],
  "pages": [
   {
    "text": "PROF. BIRCH: If you work at POKéMON\nand gain experience, I think you'll make\nan extremely good TRAINER.",
    "map_id": [
     1,
     4
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "My kid, MAY, is also studying\nPOKéMON while helping me out.",
    "map_id": [
     1,
     4
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "{PLAYER}, don't you think it might be\na good idea to go see MAY?",
    "map_id": [
     1,
     4
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   }
  ]
 },
 {
  "id": "birch-agree-see-may",
  "source": [
   "data/maps/LittlerootTown_ProfessorBirchsLab/scripts.inc"
  ],
  "requires": [
   "RIVAL_BATTLE_WON"
  ],
  "pages": [
   {
    "text": "PROF. BIRCH: Great!\nMAY should be happy, too.",
    "map_id": [
     1,
     4
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   },
   {
    "text": "Get MAY to teach you what it\nmeans to be a TRAINER.",
    "map_id": [
     1,
     4
    ],
    "speaker": "PROF. BIRCH",
    "speaker_source": "name_prefix"
   }
  ]
 },
 {
  "id": "home-sign",
  "source": [
   "data/maps/LittlerootTown/scripts.inc"
  ],
  "requires": [],
  "pages": [
   {
    "text": "{PLAYER}'s HOUSE",
    "map_id": [
     0,
     9
    ],
    "speaker": "Sign text \"RBD's HOUSE\"",
    "speaker_source": "faced_target"
   }
  ]
 },
 {
  "id": "oldale-healed",
  "source": [
   "data/scripts/pkmn_center_nurse.inc"
  ],
  "requires": [],
  "pages": [
   {
    "text": "Okay, I'll take your POKéMON\nfor a few seconds.",
    "map_id": [
     2,
     2
    ],
    "speaker": null,
    "speaker_source": null
   },
   {
    "text": "Thank you for waiting.",
    "map_id": [
     2,
     2
    ],
    "speaker": null,
    "speaker_source": null
   },
   {
    "text": "We've restored your POKéMON\nto full health.",
    "map_id": [
     2,
     2
    ],
    "speaker": null,
    "speaker_source": null
   },
   {
    "text": "We hope to see you again!",
    "map_id": [
     2,
     2
    ],
    "speaker": null,
    "speaker_source": null
   }
  ]
 },
 {
  "id": "rival-battle-intro",
  "source": [
   "data/maps/Route103/scripts.inc"
  ],
  "requires": [
   "RIVAL_BATTLE_WON"
  ],
  "pages": [
   {
    "text": "MAY: Let's see… The POKéMON found\non ROUTE 103 include…",
    "map_id": [
     0,
     18
    ],
    "speaker": "MAY",
    "speaker_source": "name_prefix"
   },
   {
    "text": "Oh, hi, {PLAYER}!",
    "map_id": [
     0,
     18
    ],
    "speaker": "MAY",
    "speaker_source": "name_prefix"
   },
   {
    "text": "…Oh, I see, my dad gave you\na POKéMON as a gift.",
    "map_id": [
     0,
     18
    ],
    "speaker": "MAY",
    "speaker_source": "name_prefix"
   },
   {
    "text": "Since we're here, let's have a quick\nbattle!",
    "map_id": [
     0,
     18
    ],
    "speaker": "MAY",
    "speaker_source": "name_prefix"
   },
   {
    "text": "I'll give you a taste of what being\na TRAINER is like.",
    "map_id": [
     0,
     18
    ],
    "speaker": "MAY",
    "speaker_source": "name_prefix"
   }
  ]
 },
 {
  "id": "rival-return-lab",
  "source": [
   "data/maps/Route103/scripts.inc"
  ],
  "requires": [
   "RECEIVED_POKEDEX"
  ],
  "pages": [
   {
    "text": "MAY: I think I know why my dad has\nan eye out for you now.",
    "map_id": [
     0,
     18
    ],
    "speaker": "MAY",
    "speaker_source": "name_prefix"
   },
   {
    "text": "I mean, you just got that POKéMON,\nbut it already likes you.",
    "map_id": [
     0,
     18
    ],
    "speaker": "MAY",
    "speaker_source": "name_prefix"
   },
   {
    "text": "You might be able to befriend any\nkind of POKéMON easily.",
    "map_id": [
     0,
     18
    ],
    "speaker": "MAY",
    "speaker_source": "name_prefix"
   },
   {
    "text": "Well, it's time to head back to\nthe LAB.",
    "map_id": [
     0,
     18
    ],
    "speaker": "MAY",
    "speaker_source": "name_prefix"
   }
  ]
 },
 {
  "id": "rival-hurry-home",
  "source": [
   "data/maps/OldaleTown/scripts.inc"
  ],
  "requires": [
   "RECEIVED_POKEDEX"
  ],
  "pages": [
   {
    "text": "MAY: {PLAYER}!\nOver here!\nLet's hurry home!",
    "map_id": [
     0,
     10
    ],
    "speaker": "MAY",
    "speaker_source": "name_prefix"
   }
  ]
 },
 {
  "id": "calvin-intro",
  "source": [
   "data/text/trainers.inc"
  ],
  "requires": [
   "ROUTE_102_TRAINER_CALVIN_DEFEATED"
  ],
  "pages": [
   {
    "text": "If you have POKéMON with you, then\nyou're an official POKéMON TRAINER!\nYou can't say no to my challenge!",
    "map_id": [
     0,
     17
    ],
    "speaker": "YOUNGSTER",
    "speaker_source": "faced_sprite"
   }
  ]
 },
 {
  "id": "rick-intro",
  "source": [
   "data/text/trainers.inc"
  ],
  "requires": [
   "ROUTE_102_TRAINER_RICK_DEFEATED"
  ],
  "pages": [
   {
    "text": "Hahah! Our eyes met!\nI'll take you on with my BUG POKéMON!",
    "map_id": [
     0,
     17
    ],
    "speaker": "BUG_CATCHER",
    "speaker_source": "faced_sprite"
   }
  ]
 },
 {
  "id": "allen-intro",
  "source": [
   "data/text/trainers.inc"
  ],
  "requires": [
   "ROUTE_102_TRAINER_ALLEN_DEFEATED"
  ],
  "pages": [
   {
    "text": "Did you just become a TRAINER?\nWe're both beginners!",
    "map_id": [
     0,
     17
    ],
    "speaker": "YOUNGSTER",
    "speaker_source": "faced_sprite"
   }
  ]
 },
 {
  "id": "petalburg-healed",
  "source": [
   "data/scripts/pkmn_center_nurse.inc"
  ],
  "requires": [],
  "pages": [
   {
    "text": "Okay, I'll take your POKéMON\nfor a few seconds.",
    "map_id": [
     8,
     4
    ],
    "speaker": null,
    "speaker_source": null
   },
   {
    "text": "Thank you for waiting.",
    "map_id": [
     8,
     4
    ],
    "speaker": null,
    "speaker_source": null
   },
   {
    "text": "We've restored your POKéMON\nto full health.",
    "map_id": [
     8,
     4
    ],
    "speaker": null,
    "speaker_source": null
   },
   {
    "text": "We hope to see you again!",
    "map_id": [
     8,
     4
    ],
    "speaker": null,
    "speaker_source": null
   }
  ]
 },
 {
  "id": "scott-introduction",
  "source": [
   "data/maps/PetalburgCity/scripts.inc"
  ],
  "requires": [],
  "pages": [
   {
    "text": "Excuse me!",
    "map_id": [
     0,
     0
    ],
    "speaker": "SCOTT",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Let me guess, from the way you're\ndressed, are you a POKéMON TRAINER?",
    "map_id": [
     0,
     0
    ],
    "speaker": "SCOTT",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "… … … … … …",
    "map_id": [
     0,
     0
    ],
    "speaker": "SCOTT",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Well, maybe not.\nYour clothes aren't all that dirty.",
    "map_id": [
     0,
     0
    ],
    "speaker": "SCOTT",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "You're either a rookie TRAINER,\nor maybe you're just an ordinary kid.",
    "map_id": [
     0,
     0
    ],
    "speaker": "SCOTT",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "I'm roaming the land in search of\ntalented TRAINERS.",
    "map_id": [
     0,
     0
    ],
    "speaker": "SCOTT",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "I'm sorry to have taken your time.",
    "map_id": [
     0,
     0
    ],
    "speaker": "SCOTT",
    "speaker_source": "faced_sprite"
   }
  ]
 },
 {
  "id": "cindy-intro",
  "source": [
   "data/text/trainers.inc"
  ],
  "requires": [
   "ROUTE_104_TRAINER_CINDY_DEFEATED"
  ],
  "pages": [
   {
    "text": "We must have been fated to meet.\nMay I ask you for a battle?",
    "map_id": [
     0,
     19
    ],
    "speaker": "WOMAN_2",
    "speaker_source": "faced_sprite"
   }
  ]
 },
 {
  "id": "lyle-intro",
  "source": [
   "data/maps/PetalburgWoods/scripts.inc"
  ],
  "requires": [
   "PETALBURG_WOODS_TRAINER_LYLE_DEFEATED"
  ],
  "pages": [
   {
    "text": "I caught a whole bunch of POKéMON!",
    "map_id": [
     24,
     11
    ],
    "speaker": "BUG_CATCHER",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Go, go, go!\nMy BUG POKéMON team!",
    "map_id": [
     24,
     11
    ],
    "speaker": "BUG_CATCHER",
    "speaker_source": "faced_sprite"
   }
  ]
 },
 {
  "id": "woods-rescue-request",
  "source": [
   "data/maps/PetalburgWoods/scripts.inc"
  ],
  "requires": [
   "TEAM_AQUA_WOODS_EVENT_COMPLETE"
  ],
  "pages": [
   {
    "text": "Hmmm…\nNot a one to be found…",
    "map_id": [
     24,
     11
    ],
    "speaker": null,
    "speaker_source": null
   },
   {
    "text": "Hello, have you seen any POKéMON\ncalled SHROOMISH around here?",
    "map_id": [
     24,
     11
    ],
    "speaker": "MAN_2",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "I really love that POKéMON.",
    "map_id": [
     24,
     11
    ],
    "speaker": "MAN_2",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "I was going to ambush you, but you\nhad to dawdle in PETALBURG WOODS\nforever, didn't you?",
    "map_id": [
     24,
     11
    ],
    "speaker": "MAN_2",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "I got sick of waiting, so here I am!",
    "map_id": [
     24,
     11
    ],
    "speaker": "MAN_2",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "You! DEVON RESEARCHER!",
    "map_id": [
     24,
     11
    ],
    "speaker": "MAN_2",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Hand over those papers!",
    "map_id": [
     24,
     11
    ],
    "speaker": "MAN_2",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Aiyeeeh!",
    "map_id": [
     24,
     11
    ],
    "speaker": "MAN_2",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "You're a POKéMON TRAINER, aren't you?\nYou've got to help me, please!",
    "map_id": [
     24,
     11
    ],
    "speaker": "MAN_2",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Hunh? What do you think you're doing?\nWhat, you're going to protect him?",
    "map_id": [
     24,
     11
    ],
    "speaker": "AQUA_MEMBER_M",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "No one who crosses TEAM AQUA\ngets any mercy, not even a kid!",
    "map_id": [
     24,
     11
    ],
    "speaker": "AQUA_MEMBER_M",
    "speaker_source": "faced_sprite"
   },
   {
    "text": "Come on and battle me!",
    "map_id": [
     24,
     11
    ],
    "speaker": "AQUA_MEMBER_M",
    "speaker_source": "faced_sprite"
   }
  ]
 },
 {
  "id": "may-background",
  "source": [
   "data/maps/LittlerootTown_ProfessorBirchsLab/scripts.inc"
  ],
  "requires": [],
  "pages": [
   {
    "text": "MAY: I wonder where I should go look\nfor POKéMON next?",
    "map_id": [
     1,
     4
    ],
    "speaker": "MAY",
    "speaker_source": "name_prefix"
   }
  ]
 }
];
