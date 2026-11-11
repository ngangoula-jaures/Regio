// Test : caméra téléphone (QR code / WebRTC) → page réceptrice OBS.
// Prérequis : `npm run dev` lancé. Caméra et micro simulés par Chromium.
import { launch, BASE, PHONE_BASE } from "./browser.mjs";

const browser = await launch(["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"]);
const errors = [];
const fail = async (msg) => {
  console.error("ÉCHEC :", msg);
  await browser.close();
  process.exit(1);
};
const videoPlaying = () => {
  const v = document.querySelector("video");
  return Boolean(v && v.videoWidth > 0 && !v.paused);
};

try {
  const recv = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  recv.on("pageerror", (e) => errors.push("réception : " + e.message));
  await recv.goto(`${BASE}/receiver.html?cam=e2e`);

  const phoneCtx = await browser.newContext({ ignoreHTTPSErrors: true, permissions: ["camera", "microphone"], viewport: { width: 800, height: 400 } });
  const phone = await phoneCtx.newPage();
  phone.on("pageerror", (e) => errors.push("téléphone : " + e.message));
  await phone.goto(`${PHONE_BASE}/phone.html?cam=e2e`);
  await phone.click("text=Démarrer la caméra");
  await phone.waitForSelector(".status.live", { timeout: 15000 });
  console.log("✓ téléphone en direct :", (await phone.textContent(".status")).trim());

  await recv.waitForFunction(videoPlaying, null, { timeout: 15000 });
  console.log("✓ vidéo reçue :", await recv.evaluate(() => `${document.querySelector("video").videoWidth}×${document.querySelector("video").videoHeight}`));

  const info = await (await fetch(`${BASE}/diffchurch/info`)).json();
  if (!info.rooms["e2e"]?.phone || !info.rooms["e2e"]?.receiver) await fail(`état du pont incorrect : ${JSON.stringify(info.rooms)}`);
  console.log("✓ état du pont :", JSON.stringify(info.rooms["e2e"]));

  await phone.waitForSelector(".stats", { timeout: 8000 });
  console.log("✓ infos techniques :", (await phone.textContent(".stats")).trim());
  if (await phone.isVisible(".rotate")) await fail("avertissement portrait affiché alors que l'image est horizontale");
  console.log("✓ pas d'avertissement portrait (image horizontale)");

  // OBS recharge la page réceptrice → le téléphone doit se reconnecter seul.
  await recv.reload();
  await recv.waitForFunction(videoPlaying, null, { timeout: 15000 });
  console.log("✓ reconnexion automatique après rechargement côté OBS");

  // Source en double (2e récepteur sur la même caméra) : le plus récent gagne, sans boucle.
  const recv2 = await (await browser.newContext()).newPage();
  await recv2.goto(`${BASE}/receiver.html?cam=e2e`);
  await recv2.waitForFunction(videoPlaying, null, { timeout: 15000 });
  await recv.waitForSelector("text=reçue ailleurs", { timeout: 5000 });
  const before = (await (await fetch(`${BASE}/diffchurch/info`)).json()).rooms["e2e"];
  await phone.waitForTimeout(4000);
  if (!(await recv2.evaluate(videoPlaying))) await fail("le 2e récepteur a perdu la vidéo (boucle de reconnexion ?)");
  if (!(await phone.isVisible(".status.live"))) await fail("le téléphone n'est plus en direct");
  console.log("✓ source en double : le plus récent garde la vidéo, l'ancien s'arrête (pas de boucle)", JSON.stringify(before));
  await recv2.close();
  await recv.reload(); // l'ancien reprend la main
  await recv.waitForFunction(videoPlaying, null, { timeout: 15000 });

  // Changement de caméra pendant le direct.
  await phone.click("text=Caméra arrière");
  await phone.waitForSelector("text=Caméra avant", { timeout: 5000 });
  if (!(await phone.isVisible(".status.live"))) await fail("le direct s'est arrêté après le changement de caméra");
  console.log("✓ changement de caméra sans coupure");

  // Couper le son.
  await phone.click("text=Son activé");
  await phone.waitForSelector("text=Son coupé");
  console.log("✓ son coupé");

  if (errors.length) await fail(errors.join("\n"));
  console.log("TOUS LES TESTS PASSENT");
} catch (e) {
  await fail(e.message);
}
await browser.close();
