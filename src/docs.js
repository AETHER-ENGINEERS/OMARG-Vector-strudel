/* In-app handbook. No network. Load buttons write the editor. */
window.STRUDEL_DOCS = {
  examples: [
    {
      id: "home",
      title: "A minor bed (default)",
      blurb: "Kick, hats, growl bass, saw lead, piano. Stay on a c e g.",
      code: `setcpm(140/4)\n\n$: s("bd*4").gain(slider(0.9, 0, 1))\n$: s("~ sd ~ sd").gain(0.52)\n$: s("hh*16").gain(slider(0.2, 0, 1))\n$: s("~ ~ oh ~").gain(0.28)\n\n$: note("[a1 a1] [a1 c2] [a1 a1] [g1 a1]")\n  .s("sawtooth")\n  .lpf(slider(340, 80, 2000))\n  .lpq(6)\n  .gain(0.48)\n\n$: note("<a3 c4 e4 g4 a4 g4 e4 c4>/2")\n  .s("sawtooth")\n  .lpf(slider(1600, 400, 4800))\n  .gain(0.26)\n\n$: note("<a3 ~ e4 c4 ~ g4 e4 a4>")\n  .s("piano")\n  .gain(slider(0.4, 0, 1))`,
    },
    {
      id: "drums",
      title: "Just drums",
      blurb: "Four-on-the-floor. Good first jam for kids.",
      code: `setcpm(120/4)\n\n$: s("bd*4").gain(slider(0.9, 0, 1))\n$: s("~ sd ~ sd").gain(0.6)\n$: s("hh*8").gain(slider(0.25, 0, 1))\n$: s("~ ~ oh ~").gain(0.3)\n$: s("~ cp").gain(0.45)`,
    },
    {
      id: "keys",
      title: "Piano in A minor",
      blurb: "Only a c e g. Swap letters, it still sings.",
      code: `setcpm(90/4)\n\n$: note("<a3 c4 e4 g4 a4 g4 e4 c4>")\n  .s("piano")\n  .gain(slider(0.55, 0, 1))\n\n$: note("a2 ~ e3 ~").s("piano").gain(0.3)`,
    },
    {
      id: "kalimba",
      title: "Kalimba + kick",
      blurb: "Stock kalimba. Soft and in key.",
      code: `setcpm(100/4)\n\n$: s("bd*4").gain(0.7)\n$: s("hh*8").gain(0.15)\n\n$: note("<a3 c4 e4 a4>/2")\n  .s("kalimba")\n  .gain(slider(0.7, 0, 1))`,
    },
    {
      id: "call",
      title: "Call and response",
      blurb: "One person edits the first line, the other the second.",
      code: `setcpm(110/4)\n\n$: s("bd*4").gain(0.8)\n$: s("~ sd ~ sd").gain(0.5)\n\n// you\n$: note("<a3 e4 a4 e4>").s("piano").gain(slider(0.45, 0, 1))\n// a friend\n$: note("<~ c4 ~ g4>").s("sawtooth").lpf(1200).gain(0.25)`,
    },
  ],
};
