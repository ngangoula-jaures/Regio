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
  await recv.goto(`${BASE}/receiver.html?cam=1`);

  const phoneCtx = await browser.newContext({ ignoreHTTPSErrors: true, permissions: ["camera", "microphone"], viewport: { width: 800, height: 400 } });
  const phone = await phoneCtx.newPage();
  phone.on("pageerror", (e) => errors.push("téléphone : " + e.message));
  await phone.goto(`${PHONE_BASE}/phone.html?cam=1`);
  await phone.click("text=Démarrer la caméra");
  await phone.waitForSelector(".status.live", { timeout: 15000 });
  console.log("✓ téléphone en direct :", (await phone.textContent(".status")).trim());

  await recv.waitForFunction(videoPlaying, null, { timeout: 15000 });
  console.log("✓ vidéo reçue :", await recv.evaluate(() => `${document.querySelector("video").videoWidth}×${document.querySelector("video").videoHeight}`));

  const info = await (await fetch(`${BASE}/diffchurch/info`)).json();
  if (!info.rooms["1"]?.phone || !info.rooms["1"]?.receiver) await fail(`état du pont incorrect : ${JSON.stringify(info.rooms)}`);
  console.log("✓ état du pont :", JSON.stringify(info.rooms["1"]));

  // OBS recharge la page réceptrice → le téléphone doit se reconnecter seul.
  await recv.reload();
  await recv.waitForFunction(videoPlaying, null, { timeout: 15000 });
  console.log("✓ reconnexion automatique après rechargement côté OBS");

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
