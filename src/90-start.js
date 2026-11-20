// ============================================================================
// Start: draw one frame, wait for the GPU, then show the menu over the live scene
// ============================================================================
goPose(0, true);
F[EXPOS] = EXPO;
await say('Letting the light in…', 1, 400);
render(); await Q.onSubmittedWorkDone();                      // pipelines finish compiling on first use
setTimeout(keep, 15e3, 'lanternLoad', '');                    // the load counts as survived after 15 s of frames
ui(true);
requestAnimationFrame((t) => { F[LAST] = t; requestAnimationFrame(frame); });
